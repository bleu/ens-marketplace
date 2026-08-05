/// The slice of Seaport 1.6 this service reads. Hand-written rather than pulled from a
/// package: apps/api needs three view functions, and the full ABI is ~1500 lines.

const ORDER_COMPONENTS = {
  type: "tuple",
  components: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    {
      name: "offer",
      type: "tuple[]",
      components: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
      ],
    },
    {
      name: "consideration",
      type: "tuple[]",
      components: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" },
      ],
    },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
} as const;

export const seaportAbi = [
  {
    name: "getOrderHash",
    type: "function",
    stateMutability: "view",
    inputs: [{ ...ORDER_COMPONENTS, name: "order" }],
    outputs: [{ name: "orderHash", type: "bytes32" }],
  },
  {
    name: "getCounter",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "offerer", type: "address" }],
    outputs: [{ name: "counter", type: "uint256" }],
  },
  {
    name: "getOrderStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "orderHash", type: "bytes32" }],
    outputs: [
      { name: "isValidated", type: "bool" },
      { name: "isCancelled", type: "bool" },
      { name: "totalFilled", type: "uint256" },
      { name: "totalSize", type: "uint256" },
    ],
  },
] as const;
