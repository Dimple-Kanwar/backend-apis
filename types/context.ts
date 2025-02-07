import { BridgeService } from "../services/bridge.service";

export interface Context {
  bridgeService: BridgeService;
  isAuthenticated: boolean;
  apiKey?: string;
}
