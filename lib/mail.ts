type SendEmailOtpInput = {
  to: string;
  otp: string;
};

function readRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export async function sendEmailOtp({ to, otp }: SendEmailOtpInput) {
  const apiKey = readRequiredEnv("RESEND_API_KEY");
  const from = readRequiredEnv("MAIL_FROM");
  const subject = "町田歯科技工所 ログイン認証コード";
  const text = [
    "町田歯科技工所のログイン認証コードです。",
    "",
    `認証コード: ${otp}`,
    "",
    "このコードは10分間有効です。",
    "心当たりがない場合は、このメールを破棄してください。",
  ].join("\n");
  const html = [
    "<p>町田歯科技工所のログイン認証コードです。</p>",
    `<p><strong style="font-size: 20px;">${otp}</strong></p>`,
    "<p>このコードは10分間有効です。</p>",
    "<p>心当たりがない場合は、このメールを破棄してください。</p>",
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend email request failed: ${response.status}`);
  }
}
