import { redirect } from "next/navigation";

/// Explore is home. This used to be a connect wall, on the reasoning that each of the
/// sources needs a specific chain, so there was nothing to show before a wallet was
/// connected. That stopped being true when mainnet became the default chain: the read-only
/// ENSv1 view renders live listings with no wallet at all, and the ENSv2 alpha view has
/// its own SepoliaRequired panel to ask for one.
export default function Home() {
  redirect("/domains");
}
