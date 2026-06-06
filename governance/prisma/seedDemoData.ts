import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedAcme(orgId: string) {
  const demoPasswordHash = await argon2.hash('Airlock123!', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  let [owner, prod, research, aiUser, compUser, secUser, analystUser, modelsCount, datasetsCount, vendorCount, threatsCount, shadowCount, reportCount, auditEventCount] = await Promise.all([
    prisma.user.findFirst({ where: { orgId, email: 'sarah.chen@acme-financial.com' } }),
    prisma.workspace.findFirst({ where: { orgId, slug: 'production' } }),
    prisma.workspace.findFirst({ where: { orgId, slug: 'ai-research' } }),
    prisma.user.findFirst({ where: { orgId, email: 'alex.kim@acme-financial.com' } }),
    prisma.user.findFirst({ where: { orgId, email: 'emma.johnson@acme-financial.com' } }),
    prisma.user.findFirst({ where: { orgId, email: 'raj.patel@acme-financial.com' } }),
    prisma.user.findFirst({ where: { orgId, email: 'lisa.wong@acme-financial.com' } }),
    prisma.aIModel.count({ where: { orgId } }),
    prisma.dataset.count({ where: { orgId } }),
    prisma.vendor.count({ where: { orgId } }),
    prisma.threatDetection.count({ where: { orgId } }),
    prisma.shadowAIAlert.count({ where: { orgId } }),
    prisma.reportHistory.count({ where: { orgId } }),
    prisma.auditEvent.count({ where: { orgId } }),
  ]);

  if (!owner) return;

  await prisma.user.updateMany({
    where: {
      orgId,
      email: {
        in: [
          'sarah.chen@acme-financial.com',
          'raj.patel@acme-financial.com',
          'emma.johnson@acme-financial.com',
          'alex.kim@acme-financial.com',
          'lisa.wong@acme-financial.com',
        ],
      },
    },
    data: { passwordHash: demoPasswordHash, emailVerified: true },
  });

  owner = await prisma.user.findFirst({ where: { orgId, email: 'sarah.chen@acme-financial.com' } });
  compUser = await prisma.user.findFirst({ where: { orgId, email: 'emma.johnson@acme-financial.com' } });
  secUser = await prisma.user.findFirst({ where: { orgId, email: 'raj.patel@acme-financial.com' } });
  aiUser = await prisma.user.findFirst({ where: { orgId, email: 'alex.kim@acme-financial.com' } });
  analystUser = await prisma.user.findFirst({ where: { orgId, email: 'lisa.wong@acme-financial.com' } });
  if (!owner) return;

  if (!research) {
    research = await prisma.workspace.create({
      data: {
        orgId,
        name: 'AI Research',
        slug: 'ai-research',
        type: 'LAB',
        description: 'ML research and experimentation',
      },
    });
  }

  if (!aiUser) {
    aiUser = await prisma.user.create({
      data: {
        orgId,
        email: 'alex.kim@acme-financial.com',
        passwordHash: owner.passwordHash,
        name: 'Alex Kim',
        title: 'AI Engineer',
        role: 'AI_ENGINEER',
        emailVerified: true,
      },
    });
  }

  if (!analystUser) {
    analystUser = await prisma.user.create({
      data: {
        orgId,
        email: 'lisa.wong@acme-financial.com',
        passwordHash: owner.passwordHash,
        name: 'Lisa Wong',
        title: 'SOC Analyst',
        role: 'ANALYST',
        emailVerified: true,
      },
    });
  }

  for (const user of [aiUser, analystUser]) {
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, workspaceId: prod?.id },
    });
    if (!membership && prod) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          workspaceId: prod.id,
          role: user.role as any,
        },
      });
    }
  }

  if (!compUser || !secUser || !prod) return;

  const currentModels = await prisma.aIModel.findMany({ where: { orgId } });
  const modelNames = new Set(currentModels.map((model) => model.name));

  if (!modelNames.has('Fraud Detection Engine')) {
    await prisma.aIModel.create({
      data: {
        orgId,
        workspaceId: prod.id,
        name: 'Fraud Detection Engine',
        provider: 'OpenAI (Fine-tuned)',
        version: '2.3.1',
        purpose: 'Real-time transaction fraud detection',
        riskLevel: 'HIGH',
        status: 'ACTIVE',
      },
    });
  }
  if (!modelNames.has('Customer Support Bot')) {
    await prisma.aIModel.create({
      data: {
        orgId,
        workspaceId: prod.id,
        name: 'Customer Support Bot',
        provider: 'Anthropic Claude',
        version: '1.2',
        purpose: 'Customer support automation',
        riskLevel: 'LIMITED',
        status: 'ACTIVE',
      },
    });
  }
  if (!modelNames.has('Loan Approval AI')) {
    await prisma.aIModel.create({
      data: {
        orgId,
        workspaceId: prod.id,
        name: 'Loan Approval AI',
        provider: 'Internal',
        version: '3.0',
        purpose: 'Automated loan underwriting and risk assessment',
        riskLevel: 'HIGH',
        status: 'UNDER_REVIEW',
      },
    });
  }
  if (!modelNames.has('Treasury Copilot Agent')) {
    await prisma.aIModel.create({
      data: {
        orgId,
        workspaceId: research.id,
        name: 'Treasury Copilot Agent',
        provider: 'OpenAI GPT-4',
        version: '0.9',
        purpose: 'Internal treasury operations assistant for analysts',
        riskLevel: 'LIMITED',
        status: 'ACTIVE',
      },
    });
  }

  const models = await prisma.aIModel.findMany({ where: { orgId } });
  const fraudModel = models.find((m) => m.name === 'Fraud Detection Engine') || models[0];
  const chatbotModel = models.find((m) => m.name === 'Customer Support Bot') || models[0];
  const loanModel = models.find((m) => m.name === 'Loan Approval AI') || models[0];
  const agentModel = models.find((m) => m.name === 'Treasury Copilot Agent') || models[0];

  if (datasetsCount === 0) {
    await prisma.dataset.createMany({
      data: [
        { orgId, name: 'Retail Banking CRM', description: 'Customer service interaction corpus', sensitivity: 'CONFIDENTIAL', recordCount: 245000 },
        { orgId, name: 'Fraud Detection Features', description: 'Normalized transaction features', sensitivity: 'RESTRICTED', recordCount: 4800000 },
        { orgId, name: 'Loan Underwriting Archive', description: 'Historical loan decisions and supporting factors', sensitivity: 'CONFIDENTIAL', recordCount: 126000 },
      ],
    });
  }

  if (vendorCount === 0) {
    const openaiVendor = await prisma.vendor.create({ data: { orgId, name: 'OpenAI Enterprise', riskLevel: 'LIMITED', services: ['LLM inference', 'Embeddings'], assessmentScore: 76, lastAssessed: new Date('2026-05-22T10:00:00Z') } });
    const anthropicVendor = await prisma.vendor.create({ data: { orgId, name: 'Anthropic', riskLevel: 'LIMITED', services: ['Customer support assistant', 'Prompt evaluation'], assessmentScore: 71, lastAssessed: new Date('2026-05-18T14:00:00Z') } });
    const datarobotVendor = await prisma.vendor.create({ data: { orgId, name: 'DataRobot MLOps', riskLevel: 'HIGH', services: ['Model governance', 'Monitoring'], assessmentScore: 61, lastAssessed: new Date('2026-05-25T09:30:00Z') } });

    await prisma.vendorSLA.createMany({
      data: [
        { vendorId: openaiVendor.id, metric: 'Availability', targetValue: 99.9, actualValue: 99.83, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: false },
        { vendorId: openaiVendor.id, metric: 'P95 Latency', targetValue: 900, actualValue: 840, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: false },
        { vendorId: datarobotVendor.id, metric: 'Assessment Turnaround', targetValue: 24, actualValue: 41, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: true },
        { vendorId: anthropicVendor.id, metric: 'Support Response', targetValue: 8, actualValue: 6, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: false },
      ],
    });
  }

  if ((await prisma.modelVersion.count({ where: { model: { orgId } } })) === 0) {
    await prisma.modelVersion.createMany({
      data: [
        { modelId: fraudModel.id, version: '2.3.1', status: 'ACTIVE', trafficPercentage: 100 },
        { modelId: loanModel.id, version: '3.1-canary', status: 'CANARY', trafficPercentage: 15 },
        { modelId: chatbotModel.id, version: '1.3-shadow', status: 'SHADOW', trafficPercentage: 5 },
        { modelId: agentModel.id, version: '0.9', status: 'ACTIVE', trafficPercentage: 100 },
      ],
    });
  }

  if ((await prisma.riskAssessment.count({ where: { model: { orgId } } })) === 0) {
    await prisma.riskAssessment.createMany({
      data: [
        { modelId: fraudModel.id, overallScore: 58, categoryBreakdown: { privacy: 32, reliability: 62 }, findings: [{ label: 'Model drift watch' }], recommendations: ['Increase monitoring window'], euAiActRiskLevel: 'HIGH', regulatoryFlags: ['NIST_AI_RMF'] },
        { modelId: fraudModel.id, overallScore: 64, categoryBreakdown: { privacy: 30, reliability: 68 }, findings: [{ label: 'False positive spike' }], recommendations: ['Review recall thresholds'], euAiActRiskLevel: 'HIGH', regulatoryFlags: ['NIST_AI_RMF'] },
        { modelId: chatbotModel.id, overallScore: 42, categoryBreakdown: { prompt_injection: 52 }, findings: [{ label: 'Prompt injection exposure' }], recommendations: ['Add stronger content filters'], euAiActRiskLevel: 'LIMITED', regulatoryFlags: ['SOC2'] },
        { modelId: loanModel.id, overallScore: 88, categoryBreakdown: { bias: 91, explainability: 77 }, findings: [{ label: 'Fairness drift' }], recommendations: ['Pause rollout pending bias review'], euAiActRiskLevel: 'HIGH', regulatoryFlags: ['EU_AI_ACT'] },
        { modelId: agentModel.id, overallScore: 36, categoryBreakdown: { governance: 41 }, findings: [{ label: 'Needs policy mapping' }], recommendations: ['Add department policy guardrails'], euAiActRiskLevel: 'LIMITED', regulatoryFlags: [] },
      ],
    });
  }

  if ((await prisma.incident.count({ where: { orgId } })) === 0) {
    await prisma.incident.createMany({
      data: [
        { orgId, workspaceId: prod.id, title: 'Loan Model Gender Bias Detected', description: 'Bias scanner detected systematic gender bias in loan approval rates. Female applicants 23% less likely to be approved at same credit score.', severity: 'CRITICAL', status: 'INVESTIGATING', assignedTo: aiUser.id, modelId: loanModel.id },
        { orgId, workspaceId: prod.id, title: 'Prompt Injection via Customer Chat', description: 'Customer successfully extracted internal API endpoints via prompt injection on support bot.', severity: 'HIGH', status: 'OPEN', assignedTo: secUser.id, modelId: chatbotModel.id },
        { orgId, workspaceId: prod.id, title: 'Fraud Model False Positive Spike', description: 'Fraud detection model flagged 340% more transactions as suspicious. Investigation underway for drift.', severity: 'MEDIUM', status: 'ACKNOWLEDGED', modelId: fraudModel.id },
      ],
    });
  }

  if ((await prisma.complianceCheck.count({ where: { orgId } })) === 0) {
    await prisma.complianceCheck.createMany({
      data: [
        { orgId, workspaceId: prod.id, framework: 'EU_AI_ACT', status: 'PARTIALLY_COMPLIANT', score: 65, answers: [] },
        { orgId, workspaceId: prod.id, framework: 'ISO_27001', status: 'COMPLIANT', score: 92, answers: [] },
        { orgId, workspaceId: prod.id, framework: 'SOC2', status: 'IN_PROGRESS', score: 40, answers: [] },
      ],
    });
  }

  if ((await prisma.complianceProfile.count({ where: { orgId } })) === 0) {
    await prisma.complianceProfile.createMany({
      data: [
        { orgId, framework: 'EU_AI_ACT', status: 'IN_PROGRESS', targetScore: 90, currentScore: 65 },
        { orgId, framework: 'ISO_27001', status: 'COMPLIANT', targetScore: 95, currentScore: 92 },
        { orgId, framework: 'SOC2', status: 'IN_PROGRESS', targetScore: 85, currentScore: 40 },
      ],
    });
  }

  if ((await prisma.policyRule.count({ where: { orgId } })) === 0) {
    await prisma.policyRule.createMany({
      data: [
        { orgId, workspaceId: prod.id, name: 'Financial Data Protection', description: 'Block transmission of financial account numbers, SSN, and transaction data', conditions: [{ field: 'detection.category', operator: 'contains', value: 'PII' }], action: 'BLOCK', priority: 10, category: 'data', enabled: true },
        { orgId, workspaceId: prod.id, name: 'Bias Monitoring', description: 'Alert on any bias-related detection patterns', conditions: [{ field: 'detection.category', operator: 'eq', value: 'BIAS' }], action: 'ALERT', priority: 20, category: 'ethics', enabled: true },
      ],
    });
  }

  if ((await prisma.auditLog.count({ where: { orgId } })) <= 1) {
    await prisma.auditLog.createMany({
      data: [
        { orgId, userId: owner.id, action: 'LOGIN', resource: 'user', resourceId: owner.id, details: { event: 'dashboard_login' } },
        { orgId, userId: compUser.id, action: 'COMPLIANCE_SCAN_COMPLETED', resource: 'compliance', details: { framework: 'EU_AI_ACT', score: 65 } },
        { orgId, userId: secUser.id, action: 'POLICY_CREATED', resource: 'policy', details: { name: 'Financial Data Protection' } },
        { orgId, userId: aiUser.id, action: 'MODEL_CREATED', resource: 'model', details: { name: 'Treasury Copilot Agent' } },
      ],
    });
  }

  if (threatsCount === 0) {
    await prisma.threatDetection.createMany({
      data: [
        { orgId, patternType: 'PROMPT_INJECTION', severity: 'HIGH', status: 'ACTIVE', details: { source: 'support-bot', count: 12 } },
        { orgId, patternType: 'DATA_EXFIL', severity: 'CRITICAL', status: 'ACTIVE', details: { source: 'loan-review', count: 2 } },
        { orgId, patternType: 'SHADOW_PROVIDER_USAGE', severity: 'MEDIUM', status: 'ACTIVE', details: { source: 'research-lab', count: 4 } },
      ],
    });
  }

  if (shadowCount === 0) {
    await prisma.shadowAIAlert.createMany({
      data: [
        { userId: aiUser.id, orgId, toolName: 'DeepSeek Browser Extension', domain: 'deepseek.com', category: 'UNSANCTIONED_LLM', isAuthorized: false, timestamp: new Date('2026-06-05T10:10:00Z') },
        { userId: analystUser.id, orgId, toolName: 'NotebookLM', domain: 'notebooklm.google.com', category: 'DATA_SYNC', isAuthorized: false, timestamp: new Date('2026-06-05T13:45:00Z') },
        { userId: secUser.id, orgId, toolName: 'Internal Red Team Sandbox', domain: 'sandbox.acme-financial.com', category: 'AUTHORIZED', isAuthorized: true, timestamp: new Date('2026-06-04T09:00:00Z') },
      ],
    });
  }

  if (reportCount === 0) {
    await prisma.reportHistory.createMany({
      data: [
        { orgId, reportType: 'compliance', format: 'PDF', fileUrl: 'generated/acme-eu-ai-act.pdf', parameters: { framework: 'EU_AI_ACT' }, generatedBy: compUser.id, generatedAt: new Date('2026-06-01T12:00:00Z') },
        { orgId, reportType: 'incident', format: 'CSV', fileUrl: 'generated/acme-incidents.csv', parameters: { scope: 'open-incidents' }, generatedBy: secUser.id, generatedAt: new Date('2026-06-03T08:30:00Z') },
        { orgId, reportType: 'usage', format: 'JSON', fileUrl: 'generated/acme-provider-usage.json', parameters: { provider: 'OpenAI Enterprise' }, generatedBy: aiUser.id, generatedAt: new Date('2026-06-04T16:15:00Z') },
      ],
    });
  }

  if (auditEventCount === 0) {
    await prisma.auditEvent.createMany({
      data: [
        { orgId, userId: aiUser.id, sessionId: 'sess_acme_ai_1', toolName: 'Treasury Copilot', llmProvider: 'OpenAI', promptHash: 'hash001', detectionResults: { detected_spans: [{ category: 'CONFIDENTIAL' }] }, riskScore: 68, actionTaken: 'REDACT', requestDurationMs: 812, upstreamStatusCode: 200 },
        { orgId, userId: analystUser.id, sessionId: 'sess_acme_soc_1', toolName: 'Support Bot', llmProvider: 'Anthropic', promptHash: 'hash002', detectionResults: { detected_spans: [{ category: 'PROMPT_INJECTION' }] }, riskScore: 92, actionTaken: 'BLOCK', requestDurationMs: 944, upstreamStatusCode: 403 },
        { orgId, userId: compUser.id, sessionId: 'sess_acme_comp_1', toolName: 'Policy Review Assistant', llmProvider: 'OpenAI', promptHash: 'hash003', detectionResults: { detected_spans: [] }, riskScore: 22, actionTaken: 'ALLOW', requestDurationMs: 431, upstreamStatusCode: 200 },
        { orgId, userId: secUser.id, sessionId: 'sess_acme_sec_1', toolName: 'Risk Triage Console', llmProvider: 'Anthropic', promptHash: 'hash004', detectionResults: { detected_spans: [{ category: 'PII' }] }, riskScore: 76, actionTaken: 'BLOCK', requestDurationMs: 1004, upstreamStatusCode: 403 },
      ],
    });
  }
}

async function seedMedi(orgId: string) {
  const [prod, compUser, devUser, model, vendors, threats, reports] = await Promise.all([
    prisma.workspace.findFirst({ where: { orgId, slug: 'production' } }),
    prisma.user.findFirst({ where: { orgId, email: 'maria.garcia@medicorp.com' } }),
    prisma.user.findFirst({ where: { orgId, email: 'tom.nakamura@medicorp.com' } }),
    prisma.aIModel.findFirst({ where: { orgId } }),
    prisma.vendor.count({ where: { orgId } }),
    prisma.threatDetection.count({ where: { orgId } }),
    prisma.reportHistory.count({ where: { orgId } }),
  ]);
  if (!prod || !compUser || !devUser || !model) return;
  if ((await prisma.dataset.count({ where: { orgId } })) === 0) {
    await prisma.dataset.createMany({ data: [
      { orgId, name: 'Clinical Notes Corpus', description: 'Patient encounter notes for model tuning', sensitivity: 'RESTRICTED', recordCount: 420000 },
      { orgId, name: 'Radiology Queue Labels', description: 'Labelled imaging triage data', sensitivity: 'CONFIDENTIAL', recordCount: 91000 },
    ]});
  }
  if (vendors === 0) {
    const vendor = await prisma.vendor.create({ data: { orgId, name: 'HealthCloud AI', riskLevel: 'HIGH', services: ['Clinical note summarization', 'Patient routing'], assessmentScore: 59, lastAssessed: new Date('2026-05-29T11:00:00Z') } });
    await prisma.vendorSLA.create({ data: { vendorId: vendor.id, metric: 'Incident SLA', targetValue: 12, actualValue: 17, periodStart: new Date('2026-05-01'), periodEnd: new Date('2026-05-31'), breached: true } });
  }
  if ((await prisma.modelVersion.count({ where: { model: { orgId } } })) === 0) {
    await prisma.modelVersion.createMany({ data: [
      { modelId: model.id, version: '1.0', status: 'ACTIVE', trafficPercentage: 80 },
      { modelId: model.id, version: '1.1-shadow', status: 'SHADOW', trafficPercentage: 20 },
    ]});
  }
  if ((await prisma.riskAssessment.count({ where: { model: { orgId } } })) === 0) {
    await prisma.riskAssessment.create({ data: { modelId: model.id, overallScore: 94, categoryBreakdown: { privacy: 95, safety: 91 }, findings: [{ label: 'PHI exposure' }], recommendations: ['Block production use until remediation'], euAiActRiskLevel: 'UNACCEPTABLE', regulatoryFlags: ['HIPAA', 'EU_AI_ACT'] } });
  }
  if ((await prisma.complianceCheck.count({ where: { orgId } })) < 2) {
    await prisma.complianceCheck.create({ data: { orgId, workspaceId: prod.id, framework: 'ISO_42001', status: 'IN_PROGRESS', score: 54, answers: [] } });
  }
  if ((await prisma.complianceProfile.count({ where: { orgId } })) === 0) {
    await prisma.complianceProfile.create({ data: { orgId, framework: 'ISO_42001', status: 'IN_PROGRESS', targetScore: 88, currentScore: 54 } });
  }
  if (threats === 0) {
    await prisma.threatDetection.create({ data: { orgId, patternType: 'PHI_EXPOSURE', severity: 'CRITICAL', status: 'ACTIVE', details: { records: 12000 } } });
  }
  if ((await prisma.shadowAIAlert.count({ where: { orgId } })) === 0) {
    await prisma.shadowAIAlert.create({ data: { userId: devUser.id, orgId, toolName: 'Public Medical Copilot', domain: 'medcopilot.example', category: 'PHI_EXFIL', isAuthorized: false } });
  }
  if ((await prisma.auditEvent.count({ where: { orgId } })) === 0) {
    await prisma.auditEvent.create({ data: { orgId, userId: compUser.id, sessionId: 'sess_medi_1', toolName: 'Diagnosis Assistant', llmProvider: 'Fine-tuned LLM', promptHash: 'hash_medi_1', detectionResults: { detected_spans: [{ category: 'HIPAA' }] }, riskScore: 97, actionTaken: 'BLOCK', requestDurationMs: 1201, upstreamStatusCode: 403 } });
  }
  if (reports === 0) {
    await prisma.reportHistory.create({ data: { orgId, reportType: 'compliance', format: 'PDF', fileUrl: 'generated/medi-hipaa.pdf', parameters: { framework: 'ISO_42001' }, generatedBy: compUser.id, generatedAt: new Date('2026-06-02T15:00:00Z') } });
  }
}

async function seedRetail(orgId: string) {
  const [owner, vendors, auditEvents] = await Promise.all([
    prisma.user.findFirst({ where: { orgId, email: 'nina.petrov@retailgpt.io' } }),
    prisma.vendor.count({ where: { orgId } }),
    prisma.auditEvent.count({ where: { orgId } }),
  ]);
  if (!owner) return;
  if (vendors === 0) {
    await prisma.vendor.create({ data: { orgId, name: 'ShopSense AI', riskLevel: 'LIMITED', services: ['Recommendation ranking'], assessmentScore: 73, lastAssessed: new Date('2026-05-20T10:15:00Z') } });
  }
  if (auditEvents === 0) {
    await prisma.auditEvent.create({ data: { orgId, userId: owner.id, sessionId: 'sess_retail_1', toolName: 'Recommendation Engine', llmProvider: 'OpenAI', promptHash: 'hash_retail_1', detectionResults: { detected_spans: [] }, riskScore: 19, actionTaken: 'ALLOW', requestDurationMs: 388, upstreamStatusCode: 200 } });
  }
}

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { in: ['acme-financial', 'medicorp-health', 'retailgpt'] } },
    select: { id: true, slug: true },
  });

  for (const org of orgs) {
    if (org.slug === 'acme-financial') await seedAcme(org.id);
    if (org.slug === 'medicorp-health') await seedMedi(org.id);
    if (org.slug === 'retailgpt') await seedRetail(org.id);
  }

  console.log(`✅ Demo backfill complete for ${orgs.length} organizations.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Demo seed backfill failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
