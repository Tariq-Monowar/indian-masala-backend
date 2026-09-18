export const orderOtpTemplate = (otp) => {
  return `<p>Your order verification code is <b>${otp}</b>.</p><p>This code expires in 10 minutes.</p>`;
};
