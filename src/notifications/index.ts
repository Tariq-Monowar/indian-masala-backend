import { sendEmail } from "./email/email.config";
import { sendInApp } from "./in_app/in_app.service";

export const notify = async (payload) => {
  const { inApp, email, io } = payload || {};

  if (inApp) {
    await sendInApp({ ...inApp, io });
  }

  if (email?.to && email?.subject && email?.html) {
    await sendEmail(email);
  }
};
