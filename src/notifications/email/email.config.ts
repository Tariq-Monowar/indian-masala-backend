import nodemailer from "nodemailer";

export const sendEmail = async ({ to, subject, html }) => {
  const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    port: 587,
    auth: {
      user: process.env.NODE_MAILER_EMAIL,
      pass: process.env.NODE_MAILER_PASSWORD,
    },
  });

  await mailTransporter.sendMail({
    from: `"Indian Masala" <${process.env.NODE_MAILER_EMAIL}>`,
    to,
    subject,
    html,
  });
};
