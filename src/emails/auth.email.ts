import { sendEmail } from "../utils/email.config";

export const forgotPasswordEmail = async (email, otp) => {
  await sendEmail(
    email,
    "Password Reset Verification Code",
    `<p>Your password reset code is <b>${otp}</b>.</p><p>This code expires in 5 minutes.</p>`,
  );
};
