import { Errors } from "@/errors/error-factory";
import { smsVerificationCodeRepository } from "@/repositories/sms-verification-codes";
import { sendSmsCode } from "@/services/sms";
import type { SmsScene } from "@gooes/domain";

class SmsVerificationCodeService {
  async sendCode(input: {
    phone: string;
    scene: SmsScene;
    requestIp: string | null;
  }) {
    const recentBoundary = new Date(Date.now() - 60 * 1000).toISOString();
    const recentCode = await smsVerificationCodeRepository.findRecentByPhoneScene({
      phone: input.phone,
      scene: input.scene,
      since: recentBoundary,
    });

    if (recentCode) {
      throw Errors.badRequest("验证码发送过于频繁，请稍后再试");
    }

    const code = this.generateVerificationCode();
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await smsVerificationCodeRepository.createPending({
      phone: input.phone,
      scene: input.scene,
      code,
      expiredAt,
      requestIp: input.requestIp,
    });

    try {
      await sendSmsCode(input.phone, code, input.scene);
    } catch (smsError) {
      await smsVerificationCodeRepository.deletePendingByPhoneSceneCode({
        phone: input.phone,
        scene: input.scene,
        code,
      });

      throw Errors.dbError("发送验证码失败", smsError);
    }
  }

  findValidPending(input: {
    phone: string;
    scene: SmsScene;
    code: string;
  }) {
    return smsVerificationCodeRepository.findValidPending({
      ...input,
      now: new Date().toISOString(),
    });
  }

  markVerified(id: string) {
    return smsVerificationCodeRepository.markVerified(id);
  }

  private generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}

export const smsVerificationCodeService = new SmsVerificationCodeService();
