import { Errors } from "@/errors/error-factory";
import { smsVerificationCodeRepository } from "@/repositories/sms-verification-codes";
import { sendSmsCode } from "@/services/sms";
import type { SmsScene } from "@gooes/domain";

const SMS_CODE_COOLDOWN_SECONDS = 60;
const SMS_CODE_TTL_SECONDS = 5 * 60;
const DEFAULT_REQUEST_IP_LIMIT = 1;

interface SmsVerificationCodeRepositoryPort {
  findRecentByPhoneScene(input: {
    phone: string;
    scene: SmsScene;
    since: string;
  }): Promise<unknown | null>;
  countRecentByRequestIpScene(input: {
    requestIp: string;
    scene: SmsScene;
    since: string;
  }): Promise<number>;
  findRecentByRequestDeviceScene(input: {
    requestDevice: string;
    scene: SmsScene;
    since: string;
  }): Promise<unknown | null>;
  createPending(input: {
    phone: string;
    scene: SmsScene;
    code: string;
    expiredAt: string;
    requestIp: string | null;
    requestDevice?: string | null;
  }): Promise<void>;
  deletePendingByPhoneSceneCode(input: {
    phone: string;
    scene: SmsScene;
    code: string;
  }): Promise<void>;
}

interface SmsVerificationCodeServiceDependencies {
  repository?: SmsVerificationCodeRepositoryPort;
  send?: (phone: string, code: string, scene: SmsScene) => Promise<void>;
}

export class SmsVerificationCodeService {
  private readonly repository: SmsVerificationCodeRepositoryPort;
  private readonly send: (phone: string, code: string, scene: SmsScene) => Promise<void>;

  constructor(dependencies: SmsVerificationCodeServiceDependencies = {}) {
    this.repository = dependencies.repository ?? smsVerificationCodeRepository;
    this.send = dependencies.send ?? sendSmsCode;
  }

  async sendCode(input: {
    phone: string;
    scene: SmsScene;
    requestIp: string | null;
    requestDevice?: string | null;
    requestIpLimit?: number;
  }) {
    const recentBoundary = new Date(
      Date.now() - SMS_CODE_COOLDOWN_SECONDS * 1000,
    ).toISOString();
    const [recentPhone, recentIpCount, recentDevice] = await Promise.all([
      this.repository.findRecentByPhoneScene({
        phone: input.phone,
        scene: input.scene,
        since: recentBoundary,
      }),
      input.requestIp
        ? this.repository.countRecentByRequestIpScene({
            requestIp: input.requestIp,
            scene: input.scene,
            since: recentBoundary,
          })
        : Promise.resolve(0),
      input.requestDevice
        ? this.repository.findRecentByRequestDeviceScene({
            requestDevice: input.requestDevice,
            scene: input.scene,
            since: recentBoundary,
          })
        : Promise.resolve(null),
    ]);
    const requestIpLimit = input.requestIpLimit ?? DEFAULT_REQUEST_IP_LIMIT;
    if (recentPhone || recentIpCount >= requestIpLimit || recentDevice) {
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

    await this.repository.createPending({
      phone: input.phone,
      scene: input.scene,
      code,
      expiredAt,
      requestIp: input.requestIp,
      requestDevice: input.requestDevice ?? null,
    });

    try {
      await this.send(input.phone, code, input.scene);
    } catch (smsError) {
      await this.repository.deletePendingByPhoneSceneCode({
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
