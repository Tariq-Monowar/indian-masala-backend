export const authOtpTemplate = (otp) => {
  return `<p>Your password reset code is <b>${otp}</b>.</p><p>This code expires in 5 minutes.</p>`;
};

export const emailChangeOtpTemplate = (otp, target) => {
  const intro =
    target === "current"
      ? "Use this code to confirm you want to change the admin email."
      : "Use this code to confirm your new admin email.";
  return `<p>${intro}</p><p>Your code is <b>${otp}</b>.</p><p>This code expires in 5 minutes.</p>`;
};
