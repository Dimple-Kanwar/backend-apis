import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const BridgeModule = buildModule("BridgeModule", (m) => {
  const platformFeePercentage = 300;
  const bridge = m.contract("Bridge", [platformFeePercentage]);
  return { bridge };
});

export default BridgeModule;
