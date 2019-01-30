import uuid from 'uuid/v4';

import { sendEmail } from './email';

export const generateVerificationToken = () => uuid().split('-').join('');

export const sendVerificationEmail = async (email, token) => sendEmail(
  [email],
  'Please verify your email',
  `<a href="https://kleidi.cameronb.me/verify/${token}">Verify email</a>`
);
