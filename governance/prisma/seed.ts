import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Airlock Enterprise Database...\n');

  const existingSeedOrg = await prisma.organization.findFirst({
    where: {
      slug: {
        in: ['acme-financial', 'medicorp-health', 'retailgpt'],
      },
    },
    select: { id: true, slug: true },
  });

  if (existingSeedOrg) {
    console.log(`ℹ️  Seed data already present (${existingSeedOrg.slug}) — skipping bootstrap seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash('Airlock123!', 12);

  // ─────────── ACME FINANCIAL ───────────
  const acme = await prisma.organization.create({
    data: {
      name: 'Acme Financial',
      slug: 'acme-financial',
      plan: 'ENTERPRISE',
      industry: 'FINANCE',
      companySize: 'ENTERPRISE',
      domain: 'acme-financial.com',
      region: 'us-east-1',
      settings: {
        dataRetentionDays: 365,
        complianceAutoScan: true,
        notificationEmail: 'security@acme-financial.com',
        requireMFA: true,
        passwordPolicy: { minLength: 12, requireSpecialChars: true, expiryDays: 90 },
      },
      features: {
        maxWorkspaces: 10,
        maxUsers: 100,
        maxModels: 100,
        auditRetentionDays: 365,
        ssoEnabled: true,
        apiAccess: true,
      },
      billingCycle: 'annual',
    },
  });

  const acmeProd = await prisma.workspace.create({ data: { orgId: acme.id, name: 'Production', slug: 'production', type: 'PRODUCTION', description: 'Production AI workloads' } });
  const acmeStaging = await prisma.workspace.create({ data: { orgId: acme.id, name: 'Staging', slug: 'staging', type: 'STAGING', description: 'Pre-production testing' } });
  const acmeResearch = await prisma.workspace.create({ data: { orgId: acme.id, name: 'AI Research', slug: 'ai-research', type: 'LAB', description: 'ML research and experimentation' } });

  // Environments for Acme
  for (const ws of [acmeProd, acmeStaging, acmeResearch]) {
    await prisma.environment.createMany({ data: [
      { workspaceId: ws.id, name: 'Production', slug: 'production', type: 'PRODUCTION' },
      { workspaceId: ws.id, name: 'Staging', slug: 'staging', type: 'STAGING' },
      { workspaceId: ws.id, name: 'Development', slug: 'development', type: 'DEVELOPMENT' },
    ]});
  }

  // Acme Users
  const acmeCEO = await prisma.user.create({ data: { email: 'sarah.chen@acme-financial.com', passwordHash, name: 'Sarah Chen', title: 'CISO', role: 'OWNER', orgId: acme.id, emailVerified: true, preferences: { theme: 'dark' } } });
  const acmeSec = await prisma.user.create({ data: { email: 'raj.patel@acme-financial.com', passwordHash, name: 'Raj Patel', title: 'Security Engineer', role: 'SECURITY_ADMIN', orgId: acme.id, emailVerified: true } });
  const acmeComp = await prisma.user.create({ data: { email: 'emma.johnson@acme-financial.com', passwordHash, name: 'Emma Johnson', title: 'Compliance Officer', role: 'COMPLIANCE_OFFICER', orgId: acme.id, emailVerified: true } });
  const acmeAI = await prisma.user.create({ data: { email: 'alex.kim@acme-financial.com', passwordHash, name: 'Alex Kim', title: 'AI Engineer', role: 'AI_ENGINEER', orgId: acme.id, emailVerified: true } });
  const acmeAnalyst = await prisma.user.create({ data: { email: 'lisa.wong@acme-financial.com', passwordHash, name: 'Lisa Wong', title: 'SOC Analyst', role: 'ANALYST', orgId: acme.id, emailVerified: true } });

  // Memberships
  for (const user of [acmeCEO, acmeSec, acmeComp, acmeAI, acmeAnalyst]) {
    await prisma.membership.create({ data: { userId: user.id, workspaceId: acmeProd.id, role: user.email === 'sarah.chen@acme-financial.com' ? 'OWNER' : user.role as any } });
    await prisma.membership.create({ data: { userId: user.id, workspaceId: acmeStaging.id, role: 'DEVELOPER' } });
  }

  // Acme Providers
  const acmeOpenAI = await prisma.provider.create({ data: { orgId: acme.id, name: 'OpenAI Enterprise', type: 'OPENAI', apiKeyEncrypted: 'sk-encrypted-' + 'a'.repeat(40), apiUrl: 'https://api.openai.com/v1', models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'], isActive: true, healthStatus: 'healthy' } });
  const acmeAnthropic = await prisma.provider.create({ data: { orgId: acme.id, name: 'Anthropic', type: 'ANTHROPIC', apiKeyEncrypted: 'sk-ant-encrypted-' + 'b'.repeat(40), apiUrl: 'https://api.anthropic.com/v1', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'], isActive: true, healthStatus: 'healthy' } });

  // Acme Models
  const acmeFraudModel = await prisma.aIModel.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, name: 'Fraud Detection Engine', provider: 'OpenAI (Fine-tuned)', version: '2.3.1', purpose: 'Real-time transaction fraud detection', riskLevel: 'HIGH', status: 'ACTIVE' } });
  const acmeChatbot = await prisma.aIModel.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, name: 'Customer Support Bot', provider: 'Anthropic Claude', version: '1.2', purpose: 'Customer support automation', riskLevel: 'LIMITED', status: 'ACTIVE' } });
  const acmeLoanModel = await prisma.aIModel.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, name: 'Loan Approval AI', provider: 'Internal', version: '3.0', purpose: 'Automated loan underwriting and risk assessment', riskLevel: 'HIGH', status: 'UNDER_REVIEW' } });
  const acmeAgent = await prisma.aIModel.create({ data: { orgId: acme.id, workspaceId: acmeResearch.id, name: 'Treasury Copilot Agent', provider: 'OpenAI GPT-4', version: '0.9', purpose: 'Internal treasury operations assistant for analysts', riskLevel: 'LIMITED', status: 'ACTIVE' } });

  await prisma.dataset.createMany({
    data: [
      { orgId: acme.id, name: 'Retail Banking CRM', description: 'Customer service interaction corpus', sensitivity: 'CONFIDENTIAL', recordCount: 245000 },
      { orgId: acme.id, name: 'Fraud Detection Features', description: 'Normalized transaction features', sensitivity: 'RESTRICTED', recordCount: 4800000 },
      { orgId: acme.id, name: 'Loan Underwriting Archive', description: 'Historical loan decisions and supporting factors', sensitivity: 'CONFIDENTIAL', recordCount: 126000 },
    ],
  });

  const acmeVendor1 = await prisma.vendor.create({ data: { orgId: acme.id, name: 'OpenAI Enterprise', riskLevel: 'LIMITED', services: ['LLM inference', 'Embeddings'], assessmentScore: 76, lastAssessed: new Date('2026-05-22T10:00:00Z') } });
  const acmeVendor2 = await prisma.vendor.create({ data: { orgId: acme.id, name: 'Anthropic', riskLevel: 'LIMITED', services: ['Customer support assistant', 'Prompt evaluation'], assessmentScore: 71, lastAssessed: new Date('2026-05-18T14:00:00Z') } });
  const acmeVendor3 = await prisma.vendor.create({ data: { orgId: acme.id, name: 'DataRobot MLOps', riskLevel: 'HIGH', services: ['Model governance', 'Monitoring'], assessmentScore: 61, lastAssessed: new Date('2026-05-25T09:30:00Z') } });

  await prisma.vendorSLA.createMany({
    data: [
      { vendorId: acmeVendor1.id, metric: 'Availability', targetValue: 99.9, actualValue: 99.83, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: false },
      { vendorId: acmeVendor1.id, metric: 'P95 Latency', targetValue: 900, actualValue: 840, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: false },
      { vendorId: acmeVendor3.id, metric: 'Assessment Turnaround', targetValue: 24, actualValue: 41, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: true },
      { vendorId: acmeVendor2.id, metric: 'Support Response', targetValue: 8, actualValue: 6, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: false },
    ],
  });

  await prisma.modelVersion.createMany({
    data: [
      { modelId: acmeFraudModel.id, version: '2.3.1', status: 'ACTIVE', trafficPercentage: 100 },
      { modelId: acmeLoanModel.id, version: '3.1-canary', status: 'CANARY', trafficPercentage: 15 },
      { modelId: acmeChatbot.id, version: '1.3-shadow', status: 'SHADOW', trafficPercentage: 5 },
      { modelId: acmeAgent.id, version: '0.9', status: 'ACTIVE', trafficPercentage: 100 },
    ],
  });

  await prisma.riskAssessment.createMany({
    data: [
      { modelId: acmeFraudModel.id, overallScore: 58, categoryBreakdown: { privacy: 32, reliability: 62 }, findings: [{ label: 'Model drift watch' }], recommendations: ['Increase monitoring window'], euAiActRiskLevel: 'HIGH', regulatoryFlags: ['NIST_AI_RMF'] },
      { modelId: acmeFraudModel.id, overallScore: 64, categoryBreakdown: { privacy: 30, reliability: 68 }, findings: [{ label: 'False positive spike' }], recommendations: ['Review recall thresholds'], euAiActRiskLevel: 'HIGH', regulatoryFlags: ['NIST_AI_RMF'] },
      { modelId: acmeChatbot.id, overallScore: 42, categoryBreakdown: { prompt_injection: 52 }, findings: [{ label: 'Prompt injection exposure' }], recommendations: ['Add stronger content filters'], euAiActRiskLevel: 'LIMITED', regulatoryFlags: ['SOC2'] },
      { modelId: acmeLoanModel.id, overallScore: 88, categoryBreakdown: { bias: 91, explainability: 77 }, findings: [{ label: 'Fairness drift' }], recommendations: ['Pause rollout pending bias review'], euAiActRiskLevel: 'HIGH', regulatoryFlags: ['EU_AI_ACT'] },
      { modelId: acmeAgent.id, overallScore: 36, categoryBreakdown: { governance: 41 }, findings: [{ label: 'Needs policy mapping' }], recommendations: ['Add department policy guardrails'], euAiActRiskLevel: 'LIMITED', regulatoryFlags: [] },
    ],
  });

  // Acme Incidents
  await prisma.incident.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, title: 'Loan Model Gender Bias Detected', description: 'Bias scanner detected systematic gender bias in loan approval rates. Female applicants 23% less likely to be approved at same credit score.', severity: 'CRITICAL', status: 'INVESTIGATING', assignedTo: acmeAI.id, modelId: acmeLoanModel.id } });
  await prisma.incident.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, title: 'Prompt Injection via Customer Chat', description: 'Customer successfully extracted internal API endpoints via prompt injection on support bot.', severity: 'HIGH', status: 'OPEN', assignedTo: acmeSec.id, modelId: acmeChatbot.id } });
  await prisma.incident.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, title: 'Fraud Model False Positive Spike', description: 'Fraud detection model flagged 340% more transactions as suspicious. Investigation underway for drift.', severity: 'MEDIUM', status: 'ACKNOWLEDGED', modelId: acmeFraudModel.id } });

  // Acme Policies
  await prisma.policyRule.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, name: 'Financial Data Protection', description: 'Block transmission of financial account numbers, SSN, and transaction data', conditions: [{ field: 'detection.category', operator: 'contains', value: 'PII' }], action: 'BLOCK', priority: 10, category: 'data', enabled: true } });
  await prisma.policyRule.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, name: 'Bias Monitoring', description: 'Alert on any bias-related detection patterns', conditions: [{ field: 'detection.category', operator: 'eq', value: 'BIAS' }], action: 'ALERT', priority: 20, category: 'ethics', enabled: true } });
  await prisma.policyRule.create({ data: { orgId: acme.id, workspaceId: acmeStaging.id, name: 'Staging - Allow All (Debug)', description: 'Allow all traffic in staging for testing', conditions: [], action: 'ALLOW', priority: 100, category: 'custom', enabled: true } });

  // Acme Compliance
  await prisma.complianceCheck.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, framework: 'EU_AI_ACT', status: 'PARTIALLY_COMPLIANT', score: 65, answers: [] } });
  await prisma.complianceCheck.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, framework: 'ISO_27001', status: 'COMPLIANT', score: 92, answers: [] } });

  // Acme Compliance Profiles
  await prisma.complianceProfile.create({ data: { orgId: acme.id, framework: 'EU_AI_ACT', status: 'IN_PROGRESS', targetScore: 90, currentScore: 65 } });
  await prisma.complianceProfile.create({ data: { orgId: acme.id, framework: 'ISO_27001', status: 'COMPLIANT', targetScore: 95, currentScore: 92 } });
  await prisma.complianceProfile.create({ data: { orgId: acme.id, framework: 'SOC2', status: 'IN_PROGRESS', targetScore: 85, currentScore: 40 } });

  await prisma.threatDetection.createMany({
    data: [
      { orgId: acme.id, patternType: 'PROMPT_INJECTION', severity: 'HIGH', status: 'ACTIVE', details: { source: 'support-bot', count: 12 } },
      { orgId: acme.id, patternType: 'DATA_EXFIL', severity: 'CRITICAL', status: 'ACTIVE', details: { source: 'loan-review', count: 2 } },
      { orgId: acme.id, patternType: 'SHADOW_PROVIDER_USAGE', severity: 'MEDIUM', status: 'ACTIVE', details: { source: 'research-lab', count: 4 } },
    ],
  });

  await prisma.shadowAIAlert.createMany({
    data: [
      { userId: acmeAI.id, orgId: acme.id, toolName: 'DeepSeek Browser Extension', domain: 'deepseek.com', category: 'UNSANCTIONED_LLM', isAuthorized: false, timestamp: new Date('2026-06-05T10:10:00Z') },
      { userId: acmeAnalyst.id, orgId: acme.id, toolName: 'NotebookLM', domain: 'notebooklm.google.com', category: 'DATA_SYNC', isAuthorized: false, timestamp: new Date('2026-06-05T13:45:00Z') },
      { userId: acmeSec.id, orgId: acme.id, toolName: 'Internal Red Team Sandbox', domain: 'sandbox.acme-financial.com', category: 'AUTHORIZED', isAuthorized: true, timestamp: new Date('2026-06-04T09:00:00Z') },
    ],
  });

  // Acme API Keys
  await prisma.aPIKey.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, userId: acmeAI.id, name: 'Production Gateway Key', keyPrefix: 'sk_prod', keyHash: 'hash_prod_key', scopes: ['proxy:chat'], isActive: true, rateLimitPerMin: 1000 } });
  await prisma.aPIKey.create({ data: { orgId: acme.id, workspaceId: acmeStaging.id, userId: acmeAI.id, name: 'Staging Test Key', keyPrefix: 'sk_stag', keyHash: 'hash_staging_key', scopes: ['proxy:chat'], isActive: true, rateLimitPerMin: 5000 } });

  // Acme Usage
  await prisma.providerUsage.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, providerId: acmeOpenAI.id, modelName: 'gpt-4', tokensIn: BigInt(1500000000), tokensOut: BigInt(250000000), requestCount: BigInt(500000), costInUsd: 12500.00 } });
  await prisma.providerUsage.create({ data: { orgId: acme.id, workspaceId: acmeProd.id, providerId: acmeAnthropic.id, modelName: 'claude-3-sonnet', tokensIn: BigInt(800000000), tokensOut: BigInt(120000000), requestCount: BigInt(200000), costInUsd: 4800.00 } });

  await prisma.reportHistory.createMany({
    data: [
      { orgId: acme.id, reportType: 'compliance', format: 'PDF', fileUrl: 'generated/acme-eu-ai-act.pdf', parameters: { framework: 'EU_AI_ACT' }, generatedBy: acmeComp.id, generatedAt: new Date('2026-06-01T12:00:00Z') },
      { orgId: acme.id, reportType: 'incident', format: 'CSV', fileUrl: 'generated/acme-incidents.csv', parameters: { scope: 'open-incidents' }, generatedBy: acmeSec.id, generatedAt: new Date('2026-06-03T08:30:00Z') },
      { orgId: acme.id, reportType: 'usage', format: 'JSON', fileUrl: 'generated/acme-provider-usage.json', parameters: { provider: 'OpenAI Enterprise' }, generatedBy: acmeAI.id, generatedAt: new Date('2026-06-04T16:15:00Z') },
    ],
  });

  await prisma.auditEvent.createMany({
    data: [
      { orgId: acme.id, userId: acmeAI.id, sessionId: 'sess_acme_ai_1', toolName: 'Treasury Copilot', llmProvider: 'OpenAI', promptHash: 'hash001', detectionResults: { detected_spans: [{ category: 'CONFIDENTIAL' }] }, riskScore: 68, actionTaken: 'REDACT', requestDurationMs: 812, upstreamStatusCode: 200 },
      { orgId: acme.id, userId: acmeAnalyst.id, sessionId: 'sess_acme_soc_1', toolName: 'Support Bot', llmProvider: 'Anthropic', promptHash: 'hash002', detectionResults: { detected_spans: [{ category: 'PROMPT_INJECTION' }] }, riskScore: 92, actionTaken: 'BLOCK', requestDurationMs: 944, upstreamStatusCode: 403 },
      { orgId: acme.id, userId: acmeComp.id, sessionId: 'sess_acme_comp_1', toolName: 'Policy Review Assistant', llmProvider: 'OpenAI', promptHash: 'hash003', detectionResults: { detected_spans: [] }, riskScore: 22, actionTaken: 'ALLOW', requestDurationMs: 431, upstreamStatusCode: 200 },
      { orgId: acme.id, userId: acmeSec.id, sessionId: 'sess_acme_sec_1', toolName: 'Risk Triage Console', llmProvider: 'Anthropic', promptHash: 'hash004', detectionResults: { detected_spans: [{ category: 'PII' }] }, riskScore: 76, actionTaken: 'BLOCK', requestDurationMs: 1004, upstreamStatusCode: 403 },
      { orgId: acme.id, userId: acmeAI.id, sessionId: 'sess_acme_ai_2', toolName: 'Treasury Copilot', llmProvider: 'OpenAI', promptHash: 'hash005', detectionResults: { detected_spans: [{ category: 'FINANCIAL_DATA' }] }, riskScore: 57, actionTaken: 'WARN', requestDurationMs: 612, upstreamStatusCode: 200 },
      { orgId: acme.id, userId: acmeAI.id, sessionId: 'sess_acme_ai_3', toolName: 'Loan Approval AI', llmProvider: 'Internal', promptHash: 'hash006', detectionResults: { detected_spans: [{ category: 'BIAS' }] }, riskScore: 83, actionTaken: 'BLOCK', requestDurationMs: 1182, upstreamStatusCode: 403 },
    ],
  });

  console.log(`✅ Acme Financial — 1 org, 3 workspaces, 5 users, 4 models, 3 incidents, 3 vendors, 2 providers`);

  // ─────────── MEDICORP HEALTH ───────────
  const medi = await prisma.organization.create({
    data: { name: 'MediCorp Health', slug: 'medicorp-health', plan: 'BUSINESS', industry: 'HEALTHCARE', companySize: 'LARGE', domain: 'medicorp.com', region: 'eu-west-1', settings: { dataRetentionDays: 730, complianceAutoScan: true, requireMFA: true }, features: { maxWorkspaces: 5, maxUsers: 50, maxModels: 50, auditRetentionDays: 730, ssoEnabled: false, apiAccess: true } },
  });

  const mediProd = await prisma.workspace.create({ data: { orgId: medi.id, name: 'Production', slug: 'production', type: 'PRODUCTION' } });
  const mediLab = await prisma.workspace.create({ data: { orgId: medi.id, name: 'AI Lab', slug: 'ai-lab', type: 'LAB' } });

  for (const ws of [mediProd, mediLab]) {
    await prisma.environment.createMany({ data: [
      { workspaceId: ws.id, name: 'Production', slug: 'production', type: 'PRODUCTION' },
      { workspaceId: ws.id, name: 'Staging', slug: 'staging', type: 'STAGING' },
      { workspaceId: ws.id, name: 'Development', slug: 'development', type: 'DEVELOPMENT' },
    ]});
  }

  const mediCISO = await prisma.user.create({ data: { email: 'james.wilson@medicorp.com', passwordHash, name: 'James Wilson', title: 'CISO', role: 'OWNER', orgId: medi.id, emailVerified: true } });
  const mediComp = await prisma.user.create({ data: { email: 'maria.garcia@medicorp.com', passwordHash, name: 'Maria Garcia', title: 'Compliance Officer', role: 'COMPLIANCE_OFFICER', orgId: medi.id, emailVerified: true } });
  const mediDev = await prisma.user.create({ data: { email: 'tom.nakamura@medicorp.com', passwordHash, name: 'Tom Nakamura', title: 'AI Engineer', role: 'AI_ENGINEER', orgId: medi.id, emailVerified: true } });

  for (const user of [mediCISO, mediComp, mediDev]) {
    await prisma.membership.create({ data: { userId: user.id, workspaceId: mediProd.id, role: user.role as any } });
  }

  const mediModel = await prisma.aIModel.create({ data: { orgId: medi.id, workspaceId: mediProd.id, name: 'Diagnosis Assistant', provider: 'Fine-tuned LLM', version: '1.0', purpose: 'AI-assisted medical diagnosis from patient symptoms', riskLevel: 'UNACCEPTABLE', status: 'UNDER_REVIEW' } });
  await prisma.dataset.createMany({ data: [
    { orgId: medi.id, name: 'Clinical Notes Corpus', description: 'Patient encounter notes for model tuning', sensitivity: 'RESTRICTED', recordCount: 420000 },
    { orgId: medi.id, name: 'Radiology Queue Labels', description: 'Labelled imaging triage data', sensitivity: 'CONFIDENTIAL', recordCount: 91000 },
  ]});
  const mediVendor = await prisma.vendor.create({ data: { orgId: medi.id, name: 'HealthCloud AI', riskLevel: 'HIGH', services: ['Clinical note summarization', 'Patient routing'], assessmentScore: 59, lastAssessed: new Date('2026-05-29T11:00:00Z') } });
  await prisma.vendorSLA.create({ data: { vendorId: mediVendor.id, metric: 'Incident SLA', targetValue: 12, actualValue: 17, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: true } });
  await prisma.modelVersion.createMany({ data: [
    { modelId: mediModel.id, version: '1.0', status: 'ACTIVE', trafficPercentage: 80 },
    { modelId: mediModel.id, version: '1.1-shadow', status: 'SHADOW', trafficPercentage: 20 },
  ]});
  await prisma.riskAssessment.create({ data: { modelId: mediModel.id, overallScore: 94, categoryBreakdown: { privacy: 95, safety: 91 }, findings: [{ label: 'PHI exposure' }], recommendations: ['Block production use until remediation'], euAiActRiskLevel: 'UNACCEPTABLE', regulatoryFlags: ['HIPAA', 'EU_AI_ACT'] } });
  await prisma.incident.create({ data: { orgId: medi.id, workspaceId: mediProd.id, title: 'HIPAA Violation — Patient Data in Training Set', description: 'Patient records found in training data without explicit consent. 12,000+ records affected.', severity: 'CRITICAL', status: 'INVESTIGATING', assignedTo: mediComp.id, modelId: mediModel.id } });
  await prisma.policyRule.create({ data: { orgId: medi.id, workspaceId: mediProd.id, name: 'HIPAA Compliance Rule', description: 'Block any prompt containing PHI (Protected Health Information)', conditions: [{ field: 'detection.category', operator: 'eq', value: 'HIPAA' }], action: 'BLOCK', priority: 5, category: 'compliance', enabled: true } });
  await prisma.complianceCheck.create({ data: { orgId: medi.id, workspaceId: mediProd.id, framework: 'ISO_42001', status: 'IN_PROGRESS', score: 54, answers: [] } });
  await prisma.complianceProfile.create({ data: { orgId: medi.id, framework: 'ISO_42001', status: 'IN_PROGRESS', targetScore: 88, currentScore: 54 } });
  await prisma.threatDetection.create({ data: { orgId: medi.id, patternType: 'PHI_EXPOSURE', severity: 'CRITICAL', status: 'ACTIVE', details: { records: 12000 } } });
  await prisma.shadowAIAlert.create({ data: { userId: mediDev.id, orgId: medi.id, toolName: 'Public Medical Copilot', domain: 'medcopilot.example', category: 'PHI_EXFIL', isAuthorized: false } });
  await prisma.auditEvent.create({ data: { orgId: medi.id, userId: mediComp.id, sessionId: 'sess_medi_1', toolName: 'Diagnosis Assistant', llmProvider: 'Fine-tuned LLM', promptHash: 'hash_medi_1', detectionResults: { detected_spans: [{ category: 'HIPAA' }] }, riskScore: 97, actionTaken: 'BLOCK', requestDurationMs: 1201, upstreamStatusCode: 403 } });
  await prisma.reportHistory.create({ data: { orgId: medi.id, reportType: 'compliance', format: 'PDF', fileUrl: 'generated/medi-hipaa.pdf', parameters: { framework: 'ISO_42001' }, generatedBy: mediComp.id, generatedAt: new Date('2026-06-02T15:00:00Z') } });

  console.log(`✅ MediCorp Health — 1 org, 2 workspaces, 3 users, 1 model, 1 incident`);

  // ─────────── RETAILGPT ───────────
  const retail = await prisma.organization.create({
    data: { name: 'RetailGPT', slug: 'retailgpt', plan: 'STARTER', industry: 'RETAIL', companySize: 'SMALL', domain: 'retailgpt.io', region: 'us-west-2', settings: { dataRetentionDays: 30, complianceAutoScan: false }, features: { maxWorkspaces: 2, maxUsers: 10, maxModels: 10, auditRetentionDays: 30, ssoEnabled: false, apiAccess: true } },
  });

  const retailProd = await prisma.workspace.create({ data: { orgId: retail.id, name: 'Production', slug: 'production', type: 'PRODUCTION' } });
  await prisma.environment.createMany({ data: [{ workspaceId: retailProd.id, name: 'Production', slug: 'production', type: 'PRODUCTION' }, { workspaceId: retailProd.id, name: 'Staging', slug: 'staging', type: 'STAGING' }] });

  const retailOwner = await prisma.user.create({ data: { email: 'nina.petrov@retailgpt.io', passwordHash, name: 'Nina Petrov', title: 'CTO', role: 'OWNER', orgId: retail.id, emailVerified: true } });
  const retailDev = await prisma.user.create({ data: { email: 'dev@retailgpt.io', passwordHash, name: 'Dev Team', title: 'Developer', role: 'DEVELOPER', orgId: retail.id, emailVerified: true } });

  for (const user of [retailOwner, retailDev]) {
    await prisma.membership.create({ data: { userId: user.id, workspaceId: retailProd.id, role: user.role as any } });
  }

  await prisma.aIModel.create({ data: { orgId: retail.id, workspaceId: retailProd.id, name: 'Product Recommendation Engine', provider: 'OpenAI GPT-4', version: '2.0', purpose: 'Personalized product recommendations', riskLevel: 'MINIMAL', status: 'ACTIVE' } });
  await prisma.vendor.create({ data: { orgId: retail.id, name: 'ShopSense AI', riskLevel: 'LIMITED', services: ['Recommendation ranking'], assessmentScore: 73, lastAssessed: new Date('2026-05-20T10:15:00Z') } });
  await prisma.auditEvent.create({ data: { orgId: retail.id, userId: retailOwner.id, sessionId: 'sess_retail_1', toolName: 'Recommendation Engine', llmProvider: 'OpenAI', promptHash: 'hash_retail_1', detectionResults: { detected_spans: [] }, riskScore: 19, actionTaken: 'ALLOW', requestDurationMs: 388, upstreamStatusCode: 200 } });

  console.log(`✅ RetailGPT — 1 org, 1 workspace, 2 users, 1 model`);

  // ─────────── AUDIT LOGS ───────────
  const auditEntries = [
    { orgId: acme.id, userId: acmeCEO.id, action: 'LOGIN' as const, resource: 'user', resourceId: acmeCEO.id, details: { event: 'first_login' } },
    { orgId: acme.id, userId: acmeCEO.id, action: 'ORGANIZATION_CREATED' as const, resource: 'organization', resourceId: acme.id },
    { orgId: acme.id, userId: acmeCEO.id, action: 'WORKSPACE_CREATED' as const, resource: 'workspace', resourceId: acmeProd.id },
    { orgId: acme.id, userId: acmeComp.id, action: 'COMPLIANCE_SCAN_COMPLETED' as const, resource: 'compliance', details: { framework: 'EU_AI_ACT', score: 65 } },
    { orgId: acme.id, userId: acmeSec.id, action: 'POLICY_CREATED' as const, resource: 'policy', details: { name: 'Financial Data Protection' } },
    { orgId: acme.id, userId: acmeCEO.id, action: 'SSO_CONFIGURED' as const, resource: 'sso', details: { provider: 'okta' } },
    { orgId: acme.id, userId: acmeAI.id, action: 'API_KEY_CREATED' as const, resource: 'api_key', resourceId: 'sk_prod' },
    { orgId: medi.id, userId: mediCISO.id, action: 'LOGIN' as const, resource: 'user' },
    { orgId: medi.id, userId: mediComp.id, action: 'INCIDENT_CREATED' as const, resource: 'incident', details: { title: 'HIPAA Violation' } },
    { orgId: retail.id, userId: retailOwner.id, action: 'LOGIN' as const, resource: 'user' },
    { orgId: retail.id, userId: retailOwner.id, action: 'MODEL_CREATED' as const, resource: 'model', details: { name: 'Product Recommendation Engine' } },
  ];

  for (const entry of auditEntries) {
    await prisma.auditLog.create({ data: entry });
  }

  console.log(`✅ Audit logs: ${auditEntries.length} entries`);
  console.log('\n🎉 Seed complete!\n');
  console.log('📧 Login credentials (all use "Airlock123!"):');
  console.log('   Acme Financial:    sarah.chen@acme-financial.com (OWNER/CISO)');
  console.log('                      raj.patel@acme-financial.com (SECURITY_ADMIN)');
  console.log('                      emma.johnson@acme-financial.com (COMPLIANCE_OFFICER)');
  console.log('   MediCorp Health:   james.wilson@medicorp.com (OWNER/CISO)');
  console.log('                      maria.garcia@medicorp.com (COMPLIANCE_OFFICER)');
  console.log('   RetailGPT:         nina.petrov@retailgpt.io (OWNER/CTO)');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error('Seed failed:', e); prisma.$disconnect(); process.exit(1); });
