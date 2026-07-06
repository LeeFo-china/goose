import { Errors } from "@/errors/error-factory";
import { smsVerificationCodeRepository } from "@/repositories/sms-verification-codes";
import { sendSmsCode } from "@/services/sms";
import type { SmsScene } from "@gooes/domain";

const SMS_CODE_COOLDOWN_SECONDS = 60;
const SMS_CODE_TTL_SECONDS = 5 * 60;

class SmsVerificationCodeService {
  async sendCode(input: {
    phone: string;
    scene: SmsScene;
    requestIp: string | null;
    requestDevice?: string | null;
  }) {
    const recentBoundary = new Date(
      Date.now() - SMS_CODE_COOLDOWN_SECONDS * 1000,
    ).toISOString();
    const recentChecks = [
      smsVerificationCodeRepository.findRecentByPhoneScene({
        phone: input.phone,
        scene: input.scene,
        since: recentBoundary,
      }),
    ];

    if (input.requestIp) {
      recentChecks.push(smsVerificationCodeRepository.findRecentByRequestIpScene({
        requestIp: input.requestIp,
        scene: input.scene,
        since: recentBoundary,
      }));
    }

    if (input.requestDevice) {
      recentChecks.push(
        smsVerificationCodeRepository.findRecentByRequestDeviceScene({
          requestDevice: input.requestDevice,
          scene: input.scene,
          since: recentBoundary,
        }),
      );
    }

    const recentCodes = await Promise.all(recentChecks);
    if (recentCodes.some(Boolean)) {
      throw Errors.business(
        429,
        "验证码发送过于频繁，请稍后再试",
        "SMS_CODE_RATE_LIMITED",
        { cooldown_seconds: SMS_CODE_COOLDOWN_SECONDS },
      );
    }

    const code = this.generateVerificationCode();
    const expiredAt = new Date(Date.now() + SMS_CODE_TTL_SECONDS * 1000)
      .toISOString();

    await smsVerificationCodeRepository.createPending({
      phone: input.phone,
      scene: input.scene,
      code,
      expiredAt,
      requestIp: input.requestIp,
      requestDevice: input.requestDevice ?? null,
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

    return {
      success: true as const,
      cooldown_seconds: SMS_CODE_COOLDOWN_SECONDS,
    };
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
