import { Errors } from "@/errors/error-factory";
import {
  smsVerificationCodeRepository,
  type SmsReservationResult,
} from "@/repositories/sms-verification-codes";
import { sendSmsCode } from "@/services/sms";
import type { SmsScene } from "@gooes/domain";

const SMS_CODE_COOLDOWN_SECONDS = 60;
const SMS_CODE_TTL_SECONDS = 5 * 60;
const DEFAULT_REQUEST_IP_LIMIT = 1;

interface SmsVerificationCodeRepositoryPort {
  reservePending(input: {
    phone: string;
    scene: SmsScene;
    code: string;
    expiredAt: string;
    since: string;
    requestIp: string | null;
    requestDevice?: string | null;
    requestIpLimit: number;
  }): Promise<SmsReservationResult>;
  deletePendingById(reservationId: string): Promise<void>;
}

interface SmsVerificationCodeServiceDependencies {
  repository?: SmsVerificationCodeRepositoryPort;
  send?: (phone: string, code: string, scene: SmsScene) => Promise<void>;
}

export class SmsVerificationCodeService {
  private readonly repository: SmsVerificationCodeRepositoryPort;
  private readonly send: (
    phone: string,
    code: string,
    scene: SmsScene,
  ) => Promise<void>;

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
    const requestIpLimit = input.requestIpLimit ?? DEFAULT_REQUEST_IP_LIMIT;
    const code = this.generateVerificationCode();
    const expiredAt = new Date(Date.now() + SMS_CODE_TTL_SECONDS * 1000)
      .toISOString();
    const reservation = await this.repository.reservePending({
      phone: input.phone,
      scene: input.scene,
      code,
      expiredAt,
      since: recentBoundary,
      requestIp: input.requestIp,
      requestDevice: input.requestDevice ?? null,
      requestIpLimit,
    });
    if (!reservation.reserved) {
      throw Errors.business(
        429,
        "验证码发送过于频繁，请稍后再试",
        "SMS_CODE_RATE_LIMITED",
        { cooldown_seconds: SMS_CODE_COOLDOWN_SECONDS },
      );
    }

    try {
      await this.send(input.phone, code, input.scene);
    } catch (smsError) {
      await this.repository.deletePendingById(reservation.id);

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
