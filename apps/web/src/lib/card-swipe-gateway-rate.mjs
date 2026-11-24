// New swipe fees come from the currently selected active gateway's settings,
// not from a customer's earlier card swipe or remembered browser state.
export function gatewayDefaultRate(gateway) {
  if (!gateway || gateway.isActive === false) return 0;
  const rate = Number(gateway.defaultChargeRate);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 0;
}
