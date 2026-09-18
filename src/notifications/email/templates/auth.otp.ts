export const authOtpTemplate = (otp) => {
  return `<p>Your password reset code is <b>${otp}</b>.</p><p>This code expires in 5 minutes.</p>`;
};
