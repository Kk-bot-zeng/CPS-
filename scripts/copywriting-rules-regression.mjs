/**
 * Deterministic regression tests for copywriting grounding guardrails.
 * No network or paid AI call is made.
 *
 * Run with Node 22+:
 *   node --experimental-strip-types scripts/copywriting-rules-regression.mjs
 */

import assert from "node:assert/strict";
import {
  ensurePublicProductNames,
  hasExplicitNewProductIntent,
  hasUserNewProductIntent,
  replaceModelReferencesInDraft,
  stripUnsupportedNewProductClaims,
  uniquePublicProductNames,
} from "../lib/copywriting-rules.ts";

const products = [
  { canonicalModel: "65鹤7 Pro 26款", promotionName: "鹤7 Pro 26款" },
  { canonicalModel: "75鹤7 Pro 26款", promotionName: "鹤7 Pro 26款" },
  { canonicalModel: "85鹤6 Ultra 26款", promotionName: "鹤6 Ultra 26款" },
];

assert.equal(hasExplicitNewProductIntent("产品卖点", "突出高刷和游戏体验"), false, "普通卖点不得开启新品口径");
assert.equal(hasExplicitNewProductIntent("不要写新品，只突出参数"), false, "明确禁止新品时不得开启新品口径");
assert.equal(hasExplicitNewProductIntent("这不是新品，只做常规促销"), false, "否定新品事实时不得开启新品口径");
assert.equal(hasExplicitNewProductIntent("活动预热", "新品上市，突出首发权益"), true, "明确新品意图应被识别");
// The active policy is deliberately not part of the authorization inputs:
// policy text may verify a fact, but cannot make the user claim a launch.
const policyWithNewProductFact = "活动政策：新品上市，9月有效";
assert.equal(hasExplicitNewProductIntent("产品卖点", "突出画质", "", "", ""), false, "政策含新品但用户未要求时不得开启新品口径");
assert.equal(hasExplicitNewProductIntent("产品卖点", "新品上市，突出首发权益"), true, "用户明确新品意图应被识别");
assert.match(policyWithNewProductFact, /新品/u, "回归夹具应包含政策中的新品事实");
const autoGroundedFacts = "推广名：鹤7；参数：新品上市后持续供货";
const autoGroundedPolicy = "9月活动政策：新品上市优惠";
assert.equal(hasUserNewProductIntent("产品卖点", "突出画质", ""), false, "自动带入资料和政策含新品时，普通用户意图仍不得开启新品口径");
assert.match(`${autoGroundedFacts}\n${autoGroundedPolicy}`, /新品/u, "回归夹具应覆盖自动资料和政策中的新品文本");

const unsupportedLaunch = "【文案草稿】\n新品来袭！鹤7 Pro 26款即将上新\n【待确认事项】\n无\n【风险状态】\n可进入人工终审";
const cleanedLaunch = stripUnsupportedNewProductClaims(unsupportedLaunch, false);
assert.equal(/新品|上新|首发|新款|全新上市/u.test(cleanedLaunch), false, "无新品意图时输出不得保留新品措辞");

const allowedLaunch = stripUnsupportedNewProductClaims(unsupportedLaunch, true);
assert.match(allowedLaunch, /新品来袭/u, "明确新品意图时应保留模型生成的新品措辞");

const modelDraft = "【文案草稿】\n鹤7 Pro 26款配置拉满，鹤6 Ultra 26款也值得关注。\n【待确认事项】\n无";
const namedDraft = replaceModelReferencesInDraft(modelDraft, products);
assert.match(namedDraft, /鹤7 Pro 26款/u, "推广名应保留为对外名称");
assert.match(namedDraft, /鹤6 Ultra 26款/u, "多产品推广名应保留");
assert.doesNotMatch(namedDraft, /65鹤7 Pro 26款|85鹤6 Ultra 26款/u, "有推广名时文案草稿不得直接出现具体标准型号");

const multiProductDraft = ensurePublicProductNames("【文案草稿】\n适合达人群传播。\n【待确认事项】\n无", products);
assert.match(multiProductDraft, /鹤7 Pro 26款/u, "整系列/多型号生成应出现去重后的推广名");
assert.match(multiProductDraft, /鹤6 Ultra 26款/u, "多产品生成应覆盖每个不同推广名");
assert.deepEqual(uniquePublicProductNames(products), ["鹤7 Pro 26款", "鹤6 Ultra 26款"], "重复尺寸应按推广名去重");

const missingPromotion = ensurePublicProductNames(
  "【文案草稿】\n参数待核验。\n【待确认事项】\n无",
  [{ canonicalModel: "55S595C Ultra", promotionName: null }],
);
assert.match(missingPromotion, /标准型号：55S595C Ultra（推广名缺失）/u, "推广名缺失时必须明确安全降级");
const annotatedFallback = ensurePublicProductNames(
  "【文案草稿】\n55S595C Ultra 参数待核验。\n【待确认事项】\n无",
  [{ canonicalModel: "55S595C Ultra", promotionName: null }],
);
assert.match(annotatedFallback, /标准型号：55S595C Ultra（推广名缺失）/u, "即使模型已输出标准型号，仍需明确推广名缺失");

const selectedSeriesProducts = [65, 75, 85, 98].map((size) => ({
  canonicalModel: `${size}鹤7 PRO 26款`,
  promotionName: `${size}鹤7 PRO 26款`,
  seriesPublicName: "鹤7 PRO 26款",
}));
const seriesDraft = "【文案草稿】\n65鹤7 PRO 26款、75鹤7 PRO 26款、85鹤7 PRO 26款、98鹤7 PRO 26款，整系列值得关注。\n【待确认事项】\n无";
const seriesNamedDraft = ensurePublicProductNames(replaceModelReferencesInDraft(seriesDraft, selectedSeriesProducts), selectedSeriesProducts);
assert.match(seriesNamedDraft, /鹤7 PRO 26款/u, "整系列文案应使用已核验系列名称");
assert.doesNotMatch(seriesNamedDraft, /(?:65|75|85|98)鹤7 PRO 26款/u, "整系列文案不得列出具体尺寸型号");
const inchSeriesDraft = "【文案草稿】\n65英寸鹤7 PRO 26款和98吋鹤7 PRO 26款同属一个系列。\n【待确认事项】\n无";
const inchSeriesNamedDraft = replaceModelReferencesInDraft(inchSeriesDraft, selectedSeriesProducts);
assert.match(inchSeriesNamedDraft, /鹤7 PRO 26款/u, "系列名应覆盖带英寸单位的模型表述");
assert.doesNotMatch(inchSeriesNamedDraft, /(?:65|98)(?:英寸|吋)鹤7 PRO 26款/u, "系列文案不得保留带单位的尺寸前缀");
const missingPromotionSeriesDraft = replaceModelReferencesInDraft(
  "【文案草稿】\n65鹤7 PRO 26款适合整系列推广。\n【待确认事项】\n无",
  [{ canonicalModel: "65鹤7 PRO 26款", promotionName: null, seriesPublicName: "鹤7 PRO 26款" }],
);
assert.match(missingPromotionSeriesDraft, /鹤7 PRO 26款适合整系列推广/u, "推广名为空时仍应使用已核验系列公共名称");
assert.doesNotMatch(missingPromotionSeriesDraft, /65鹤7 PRO 26款/u, "系列公共名称存在时不得保留标准型号");

console.log("copywriting-rules regression: PASS");
