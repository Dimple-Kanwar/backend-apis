import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const ProxyModule = buildModule("ProxyModule", (m) => {
  const BASE_BRIDGE_ADDRESS = "0xF7f458a75e1dd682b2A826f0e4182E46Bd56Da8A";
  const SEPOLIA_BRIDGE_ADDRESS = "0x00A27432A5909ac0B64E4B11d4dB9cE0fAA03bf1";
  // const Proxy = m.contract("TransparentProxy", [BASE_BRIDGE_ADDRESS]);
  const Proxy = m.contract("TransparentProxy", [SEPOLIA_BRIDGE_ADDRESS]);
  return { Proxy };
});

export default ProxyModule;
