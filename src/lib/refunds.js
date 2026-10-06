export function refundPresentation(booking) {
  const ownerChoice = booking.status === 'CANCELADA'
    && booking.cancellationReason === 'CANCELLED_BY_OWNER'
    && booking.economicOutcome === 'FULL_REFUND_OR_RESCHEDULE' && !booking.economicResolution;
  const weatherChoice = booking.status === 'CANCELADA'
    && booking.cancellationReason === 'CLIENTE_EXCEPCION'
    && booking.economicOutcome === 'REFUND_ALLOWED' && !booking.economicResolution;
  return {
    canReschedule: ownerChoice,
    canRequestRefund: ownerChoice || weatherChoice,
    status: booking.refundState === 'REFUNDED' ? 'Reembolso procesado'
      : booking.refundState === 'REFUND_PENDING' || booking.paymentStatus === 'REFUND_PENDING'
        ? 'Reembolso en proceso' : null,
  };
}
