import nodemailer from 'nodemailer';


let smtpTransport;

export const init = (env) => {
  const { MAILER_CREDENTIALS } = env;
  const credSplit = MAILER_CREDENTIALS.split('::'); // username::password::host::port

  try {
    const [user, pass, host, port] = credSplit;

    smtpTransport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: {
        user,
        pass
      }
    });
  } catch (e) {
    console.error('Error parsing SMTP credentials from environment');
    console.error(e);
    process.exit(1);
  }
};

export const sendEmail = async (emails, subject, content) => {
  const emailsString = emails.join(', ');
  console.log('sending emails to: ', emailsString);
  try {
    const res = await smtpTransport.sendMail({
      from: 'Kleidi <noreply@cameronb.me>',
      to: emailsString,
      subject,
      html: content
    });

    return res;
  } catch (e) {
    console.error('Error sending email: ', e);
    return null;
  }
};
