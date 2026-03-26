import nodemailer from "nodemailer";
import config from "../config/index.js";

let transporter;

const hasMailConfig = () => {
  return Boolean(
    config.mail.host &&
      config.mail.port &&
      config.mail.user &&
      config.mail.pass,
  );
};

const getTransporter = () => {
  if (!hasMailConfig()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: {
        user: config.mail.user,
        pass: config.mail.pass,
      },
    });
  }

  return transporter;
};

export const sendPasswordResetEmail = async ({ to, username, resetUrl }) => {
  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, reason: "MAIL_NOT_CONFIGURED" };
  }

  const safeName = username || "there";
  const appName = "Apna Meet";

  const text = `Hi ${safeName},\n\nWe received a password reset request for your ${appName} account.\n\nReset your password here:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can safely ignore this email.\n\n- ${appName} Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Reset your password</h2>
      <p>Hi ${safeName},</p>
      <p>We received a password reset request for your ${appName} account.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Reset Password</a>
      </p>
      <p>Or paste this link in your browser:</p>
      <p style="word-break: break-all;">${resetUrl}</p>
      <p>This link expires in <strong>1 hour</strong>.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
      <p>- ${appName} Team</p>
    </div>
  `;

  await mailer.sendMail({
    from: config.mail.from,
    to,
    subject: "Reset your Apna Meet password",
    text,
    html,
  });

  return { sent: true };
};

export const isEmailServiceConfigured = () => hasMailConfig();
