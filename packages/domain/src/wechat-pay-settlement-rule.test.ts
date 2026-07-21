import { describe, expect, test } from 'bun:test';
import {
  findWechatPaySettlementRule,
  getWechatPaySettlementRulesForSubject,
} from './wechat-pay-settlement-rule';

describe('wechat pay settlement rule catalog', () => {
  test('returns the decoration rule for each supported subject', () => {
    expect(
      getWechatPaySettlementRulesForSubject('SUBJECT_TYPE_ENTERPRISE')[0],
    ).toMatchObject({
      id: '716',
      qualificationType: '零售批发/生活娱乐/网上商城/其他',
    });
    expect(
      getWechatPaySettlementRulesForSubject('SUBJECT_TYPE_INDIVIDUAL')[0],
    ).toMatchObject({
      id: '719',
      qualificationType: '零售批发/生活娱乐/其他',
    });
  });

  test('only resolves an exact subject, id and industry combination', () => {
    expect(
      findWechatPaySettlementRule(
        'SUBJECT_TYPE_ENTERPRISE',
        '716',
        '零售批发/生活娱乐/网上商城/其他',
      )?.id,
    ).toBe('716');
    expect(
      findWechatPaySettlementRule(
        'SUBJECT_TYPE_ENTERPRISE',
        '719',
        '零售批发/生活娱乐/其他',
      ),
    ).toBeUndefined();
  });
});
