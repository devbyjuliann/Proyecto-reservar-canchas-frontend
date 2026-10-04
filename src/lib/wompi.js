export function toWompiWidgetConfig(checkoutData) {
  const config = checkoutData?.config;
  if (!config || typeof config.signature?.integrity !== 'string' || config.signature.integrity.length === 0) {
    throw new TypeError('Wompi checkout integrity signature is required');
  }
  return {
    publicKey: config.publicKey,
    currency: config.currency,
    amountInCents: config.amountInCents,
    reference: config.reference,
    signature: { integrity: config.signature.integrity },
    expirationTime: config.expirationTime,
    ...(config.redirectUrl ? { redirectUrl: config.redirectUrl } : {}),
  };
}
