/** SMS OTP channel — delivers the code via Africa's Talking. */
import type { OtpChannel } from "./index";
import { sendOtp } from "../messaging";

export const smsChannel: OtpChannel = {
  name: "sms",
  async send(phone: string, code: string): Promise<void> {
    await sendOtp(phone, code);
  },
};
