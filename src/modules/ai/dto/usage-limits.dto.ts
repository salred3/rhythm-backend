export interface UsageLimitsDto {
  daily?: {
    classification?: number;
    chat?: number;
    total?: number;
  };
  weekly?: {
    classification?: number;
    chat?: number;
    total?: number;
  };
  monthly?: {
    classification?: number;
    chat?: number;
    total?: number;
  };
  costLimit?: number;
  warningThreshold?: number;
}
