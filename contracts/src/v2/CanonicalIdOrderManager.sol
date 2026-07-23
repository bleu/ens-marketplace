// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IENSv2Registry} from "./interfaces/IENSv2Registry.sol";
import {IRegistryAdmin} from "../mock/IRegistryAdmin.sol";
import {StateHash} from "./libraries/StateHash.sol";

/// @notice v2-native order contract keyed on canonical ID, with regeneration-AWARE (not
/// regeneration-surviving) validation — see docs/architecture.md. An order pins a hash of
/// the buyer-relevant state (owner, resolver) at listing time. If that state changes
/// before fill (ENSv2 mutates a name's token/state on role/resolver changes, specifically
/// to kill the v1 "swap the resolver after listing" scam), the order suspends rather than
/// silently continuing to be fillable.
///
/// Runs against `IRegistryAdmin` (see that file) — a mock stand-in write ABI for the local
/// demo, not confirmed real ENSv2 behavior.
contract CanonicalIdOrderManager is ReentrancyGuard {
    enum Status {
        None,
        Active,
        Suspended,
        Filled,
        Cancelled
    }

    struct Order {
        address seller;
        uint256 price;
        bytes32 pinnedHash;
        address pinnedOwner;
        address pinnedResolver;
        Status status;
    }

    address public immutable registry;

    mapping(uint256 => Order) public orders;

    event Listed(uint256 indexed canonicalId, address indexed seller, uint256 price, bytes32 pinnedHash);
    event Relisted(uint256 indexed canonicalId, uint256 newPrice, bytes32 pinnedHash);
    event Cancelled(uint256 indexed canonicalId);
    event Filled(uint256 indexed canonicalId, address indexed buyer, uint256 price);
    event OrderSuspended(uint256 indexed canonicalId, bytes32 pinnedHash, bytes32 liveHash);
    event Refilled(uint256 indexed canonicalId, address indexed buyer, uint256 price);

    error NotSeller();
    error NotAuthorizedToTransfer();
    error OrderNotActive();
    error OrderNotSuspended();
    error InsufficientPayment();
    error StateMismatch();
    error SellerChanged();
    error PaymentFailed();

    constructor(address registry_) {
        registry = registry_;
    }

    function _liveState(uint256 canonicalId) private view returns (address owner, address resolver, bytes32 hash) {
        owner = IENSv2Registry(registry).ownerOf(canonicalId);
        resolver = IENSv2Registry(registry).resolverOf(canonicalId);
        hash = StateHash.hash(StateHash.PinnedState({owner: owner, resolver: resolver}));
    }

    function list(uint256 canonicalId, uint256 price) external returns (bytes32 pinnedHash) {
        address owner = IENSv2Registry(registry).ownerOf(canonicalId);
        if (owner != msg.sender) revert NotSeller();
        if (IRegistryAdmin(registry).transferApproval(canonicalId) != address(this)) revert NotAuthorizedToTransfer();

        (address liveOwner, address liveResolver, bytes32 hash) = _liveState(canonicalId);
        pinnedHash = hash;

        orders[canonicalId] = Order({
            seller: msg.sender,
            price: price,
            pinnedHash: pinnedHash,
            pinnedOwner: liveOwner,
            pinnedResolver: liveResolver,
            status: Status.Active
        });

        emit Listed(canonicalId, msg.sender, price, pinnedHash);
    }

    function relist(uint256 canonicalId, uint256 newPrice) external {
        Order storage order = orders[canonicalId];
        if (order.seller != msg.sender) revert NotSeller();

        (address liveOwner, address liveResolver, bytes32 hash) = _liveState(canonicalId);

        order.price = newPrice;
        order.pinnedHash = hash;
        order.pinnedOwner = liveOwner;
        order.pinnedResolver = liveResolver;
        order.status = Status.Active;

        emit Relisted(canonicalId, newPrice, hash);
    }

    function cancel(uint256 canonicalId) external {
        Order storage order = orders[canonicalId];
        if (order.seller != msg.sender) revert NotSeller();

        order.status = Status.Cancelled;
        emit Cancelled(canonicalId);
    }

    function buy(uint256 canonicalId) external payable nonReentrant {
        Order storage order = orders[canonicalId];
        if (order.status != Status.Active) revert OrderNotActive();
        if (msg.value < order.price) revert InsufficientPayment();

        (,, bytes32 liveHash) = _liveState(canonicalId);

        if (liveHash != order.pinnedHash) {
            // A revert here would undo the Suspended write below along with it (Solidity
            // reverts roll back every state change made in the same call) - so instead of
            // reverting, we persist Suspended, refund in full, and return normally. The
            // order genuinely didn't fill; callers must check the Filled/OrderSuspended
            // event (or re-read order status) rather than assume tx success == purchase.
            order.status = Status.Suspended;
            emit OrderSuspended(canonicalId, order.pinnedHash, liveHash);

            (bool refunded,) = payable(msg.sender).call{value: msg.value}("");
            if (!refunded) revert PaymentFailed();
            return;
        }

        _settle(canonicalId, order);
        emit Filled(canonicalId, msg.sender, order.price);
    }

    function diff(uint256 canonicalId)
        external
        view
        returns (address pinnedOwner, address pinnedResolver, address liveOwner, address liveResolver, bool mismatched)
    {
        Order storage order = orders[canonicalId];
        pinnedOwner = order.pinnedOwner;
        pinnedResolver = order.pinnedResolver;
        (liveOwner, liveResolver,) = _liveState(canonicalId);
        mismatched = (liveOwner != pinnedOwner || liveResolver != pinnedResolver);
    }

    /// @notice Explicit, informed re-fill after a buyer reviews `diff()`. Re-derives live
    /// state fresh at execution time and requires it match `expectedLiveHash` — guarding
    /// against a further mutation between the buyer's diff-review and this transaction.
    function acceptDiffAndRefill(uint256 canonicalId, bytes32 expectedLiveHash) external payable nonReentrant {
        Order storage order = orders[canonicalId];
        if (order.status != Status.Suspended) revert OrderNotSuspended();
        if (msg.value < order.price) revert InsufficientPayment();

        address currentOwner = IENSv2Registry(registry).ownerOf(canonicalId);
        if (currentOwner != order.seller) revert SellerChanged();

        (,, bytes32 liveHash) = _liveState(canonicalId);
        if (liveHash != expectedLiveHash) revert StateMismatch();

        _settle(canonicalId, order);
        emit Refilled(canonicalId, msg.sender, order.price);
    }

    function _settle(uint256 canonicalId, Order storage order) private {
        address seller = order.seller;
        uint256 price = order.price;
        order.status = Status.Filled;

        IRegistryAdmin(registry).transferOwner(canonicalId, msg.sender);

        (bool success,) = payable(seller).call{value: price}("");
        if (!success) revert PaymentFailed();

        uint256 excess = msg.value - price;
        if (excess > 0) {
            (bool refunded,) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert PaymentFailed();
        }
    }
}
