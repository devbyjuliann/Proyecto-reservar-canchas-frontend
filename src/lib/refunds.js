export function refundPresentation(booking) {
  return {
    canReschedule: booking.rescheduleEligible === true,
    canRequestRefund: booking.refundEligible === true,
    status: booking.refundState === 'REFUNDED' ? 'Reembolso procesado'
      : booking.refundState === 'REFUND_PENDING' || booking.paymentStatus === 'REFUND_PENDING'
        ? 'Reembolso en proceso' : null,
  };
}
