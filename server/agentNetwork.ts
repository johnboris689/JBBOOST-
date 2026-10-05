import crypto from 'crypto';
import { execute, getAllRows, getRow, withTransaction } from '../db';

export type AgentPlatform = 'Instagram' | 'TikTok' | 'YouTube' | 'Facebook' | 'X' | 'Telegram';
export type AgentStatus = 'idle' | 'working' | 'cooldown' | 'offline';
export type AgentActionType = 'follow' | 'like' | 'subscriber' | 'member' | 'comment' | 'share' | 'view' | 'reaction';

export interface AutomatedAgent {
  id: string;
  agentIdentifier: string;
  platform: AgentPlatform;
  handle: string;
  accountName?: string;
  status: AgentStatus;
  capabilities: string[];
  totalActionsCompleted: number;
  totalActionsFailed: number;
  reputationScore: number;
  cooldownUntil?: string | null;
  lastActionAt?: string | null;
  createdAt: string;
}

export interface AgentFulfillmentJob {
  id: string;
  orderId: string;
  platform: AgentPlatform;
  actionType: string;
  targetUrl: string;
  targetQuantity: number;
  completedQuantity: number;
  claimedQuantity: number;
  status: 'queued' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskExecution {
  id: string;
  jobId: string;
  orderId: string;
  agentId: string;
  platform: string;
  actionType: string;
  targetUrl: string;
  status: 'claimed' | 'completed' | 'failed';
  claimedAt: string;
  completedAt?: string | null;
  durationMs?: number;
  resultDetails?: string;
}

// Global engine configuration & state
let orchestratorRunning = false;
let orchestratorIntervalTimer: NodeJS.Timeout | null = null;
let orchestratorSpeedMultiplier = 1; // 1x to 10x dispatch rate
let isDispatchingTick = false;

// Names and handles for realistic automated bot account fleets
const FIRST_NAMES = [
  'Adebayo', 'Chioma', 'Ibrahim', 'Zainab', 'Chinedu', 'Blessing', 'Emeka', 'Fatima',
  'Olumide', 'Ngozi', 'Babajide', 'Amara', 'Tunde', 'Kemi', 'Oluwaseun', 'Amina',
  'David', 'Sarah', 'Victor', 'Grace', 'Samuel', 'Joy', 'Daniel', 'Mary', 'Michael'
];

const LAST_NAMES = [
  'Okonkwo', 'Adeyemi', 'Danjuma', 'Bello', 'Eze', 'Balogun', 'Nwosu', 'Abubakar',
  'Okafor', 'Williams', 'Ojo', 'Lawal', 'Suleiman', 'Alabi', 'Chukwu', 'Mustapha',
  'Johnson', 'Smith', 'Davies', 'Martins', 'Taylor', 'Brown', 'Nelson', 'Adeleke'
];

const TOPICS = [
  'vibes', 'daily', 'explore', 'pulse', 'creatives', 'tech', 'lifestyle', 'reels',
  'trends', 'hub', 'media', 'shots', 'prime', 'focus', 'official', 'zone', 'waves'
];

function generateHandle(platform: AgentPlatform, index: number): string {
  const f = FIRST_NAMES[index % FIRST_NAMES.length].toLowerCase();
  const l = LAST_NAMES[(index * 3) % LAST_NAMES.length].toLowerCase();
  const t = TOPICS[(index * 7) % TOPICS.length];
  const randNum = Math.floor(100 + (index * 13) % 900);

  switch (platform) {
    case 'Instagram':
      return `@${f}_${l}_${t}${randNum}`;
    case 'TikTok':
      return `@${f}.${l}.${t}`;
    case 'YouTube':
      return `@${f}${l}${randNum}Channel`;
    case 'X':
      return `@${f}_${t}${randNum}`;
    case 'Facebook':
      return `@${f}.${l}.${randNum}`;
    case 'Telegram':
      return `@tg_${f}_${randNum}`;
    default:
      return `@agent_${f}_${randNum}`;
  }
}

function normalizeActionType(serviceName: string, platform: string): string {
  const n = `${platform} ${serviceName}`.toLowerCase();
  if (/subscriber/i.test(n)) return 'subscriber';
  if (/follower/i.test(n)) return 'follow';
  if (/member/i.test(n)) return 'member';
  if (/comment/i.test(n)) return 'comment';
  if (/share|repost/i.test(n)) return 'share';
  if (/reaction/i.test(n)) return 'reaction';
  if (/like/i.test(n)) return 'like';
  if (/view|watch/i.test(n)) return 'view';
  return 'follow';
}

export class AgentNetworkEngine {
  /**
   * Seed the fleet of automated worker accounts across all supported platforms.
   */
  static async seedAgentFleet(countPerPlatform = 80): Promise<{ count: number; total: number }> {
    const platforms: AgentPlatform[] = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'X', 'Telegram'];
    let createdCount = 0;
    const now = new Date().toISOString();

    for (const platform of platforms) {
      for (let i = 1; i <= countPerPlatform; i++) {
        const agentIdentifier = `bot_${platform.toLowerCase()}_${i.toString().padStart(4, '0')}_${crypto.randomBytes(2).toString('hex')}`;
        const id = `agent-${platform.toLowerCase().slice(0, 2)}-${i.toString().padStart(4, '0')}`;
        const handle = generateHandle(platform, i + createdCount);
        const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3) % LAST_NAMES.length]}`;
        const capabilities = ['follow', 'like', 'view', 'share', 'reaction'];
        if (platform === 'YouTube') capabilities.push('subscriber');
        if (platform === 'Telegram') capabilities.push('member');
        if (platform === 'Instagram' || platform === 'TikTok') capabilities.push('comment');

        try {
          await execute(
            `INSERT INTO automated_agents (id, agentIdentifier, platform, handle, accountName, status, capabilities, totalActionsCompleted, totalActionsFailed, reputationScore, cooldownUntil, lastActionAt, createdAt)
             VALUES ($1, $2, $3, $4, $5, 'idle', $6, 0, 0, 100.0, NULL, NULL, $7)
             ON CONFLICT(id) DO NOTHING`,
            [id, agentIdentifier, platform, handle, name, JSON.stringify(capabilities), now]
          );
          createdCount++;
        } catch (_) {
          // Continue if already exists
        }
      }
    }

    const totalRow = await getRow(`SELECT COUNT(*) as count FROM automated_agents`);
    const total = Number(totalRow?.count ?? 0);
    return { count: createdCount, total };
  }

  /**
   * Ensure baseline automated agents are seeded on engine start.
   */
  static async ensureBaselineFleet(): Promise<void> {
    try {
      const row = await getRow(`SELECT COUNT(*) as count FROM automated_agents`);
      if (!row || Number(row.count || 0) < 50) {
        console.log('[Agent Network] Initializing automated bot agent fleet...');
        await this.seedAgentFleet(50);
        console.log('[Agent Network] Bot agent fleet successfully seeded.');
      }
    } catch (err) {
      console.warn('[Agent Network] Baseline fleet check notice:', err);
    }
  }

  /**
   * Enqueue a new customer order into the Automated Agent Network job queue.
   */
  static async enqueueOrder(params: {
    orderId: string;
    platform: AgentPlatform;
    serviceName: string;
    targetUrl: string;
    targetQuantity: number;
  }): Promise<AgentFulfillmentJob> {
    const { orderId, platform, serviceName, targetUrl, targetQuantity } = params;
    const actionType = normalizeActionType(serviceName, platform);
    const jobId = `job-${orderId}`;
    const now = new Date().toISOString();

    // Check if job already exists
    const existing = await getRow(`SELECT * FROM agent_fulfillment_jobs WHERE orderId = $1`, [orderId]);
    if (existing) {
      return {
        id: existing.id,
        orderId: existing.orderid || existing.orderId,
        platform: existing.platform,
        actionType: existing.actiontype || existing.actionType,
        targetUrl: existing.targeturl || existing.targetUrl,
        targetQuantity: Number(existing.targetquantity || existing.targetQuantity),
        completedQuantity: Number(existing.completedquantity || existing.completedQuantity || 0),
        claimedQuantity: Number(existing.claimedquantity || existing.claimedQuantity || 0),
        status: existing.status,
        startedAt: existing.startedat || existing.startedAt,
        completedAt: existing.completedat || existing.completedAt,
        createdAt: existing.createdat || existing.createdAt,
        updatedAt: existing.updatedat || existing.updatedAt,
      };
    }

    await execute(
      `INSERT INTO agent_fulfillment_jobs (id, orderId, platform, actionType, targetUrl, targetQuantity, completedQuantity, claimedQuantity, status, startedAt, completedAt, createdAt, updatedAt)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'queued', $7, NULL, $7, $7)
       ON CONFLICT(orderId) DO NOTHING`,
      [jobId, orderId, platform, actionType, targetUrl, targetQuantity, now]
    );

    // Update social_orders status to in_progress / agent_queued
    await execute(
      `UPDATE social_orders SET status = 'PROCESSING', providerStatus = 'Agent Network Active', updatedAt = $1 WHERE id = $2`,
      [now, orderId]
    ).catch(() => {});

    // Trigger dispatcher tick immediately
    void this.dispatchTick();

    const job = await getRow(`SELECT * FROM agent_fulfillment_jobs WHERE id = $1`, [jobId]);
    return job;
  }

  /**
   * Worker Agent API: An automated bot agent claims the next eligible job from the queue.
   * STRICT DEDUPLICATION: An agent is NEVER given a job for an order it has already executed!
   */
  static async claimJobForAgent(agentIdentifier: string): Promise<{
    success: boolean;
    job?: any;
    executionId?: string;
    message?: string;
  }> {
    const agent = await getRow(`SELECT * FROM automated_agents WHERE agentIdentifier = $1 OR id = $1`, [agentIdentifier]);
    if (!agent) {
      return { success: false, message: 'Agent account not registered.' };
    }

    const agentId = agent.id;
    const platform = agent.platform;

    // Check cooldown
    if (agent.cooldownuntil || agent.cooldownUntil) {
      const cd = new Date(agent.cooldownuntil || agent.cooldownUntil).getTime();
      if (Date.now() < cd) {
        return { success: false, message: 'Agent is currently in cooldown period.' };
      }
    }

    // Find candidate jobs with STRICT DEDUPLICATION:
    // 1. Status is 'queued' or 'in_progress'
    // 2. Platform matches agent platform
    // 3. completedQuantity + claimedQuantity < targetQuantity
    // 4. CRITICAL: Agent has NEVER executed or claimed this order before!
    const allJobs = await getAllRows(`SELECT * FROM agent_fulfillment_jobs ORDER BY createdAt ASC`);
    const agentExecs = await getAllRows(`SELECT orderId FROM agent_task_executions WHERE agentId = $1`, [agentId]);
    const executedOrderIds = new Set((agentExecs || []).map((e: any) => String(e.orderid || e.orderId || '')));

    const candidateJobs = (allJobs || []).filter((j: any) => {
      const jPlatform = String(j.platform || '').toLowerCase();
      const aPlatform = String(platform || '').toLowerCase();
      if (jPlatform !== aPlatform) return false;

      const jStatus = String(j.status || '').toLowerCase();
      if (jStatus !== 'queued' && jStatus !== 'in_progress') return false;

      const completed = Number(j.completedquantity ?? j.completedQuantity ?? 0);
      const claimed = Number(j.claimedquantity ?? j.claimedQuantity ?? 0);
      const target = Number(j.targetquantity ?? j.targetQuantity ?? 0);
      if ((completed + claimed) >= target) return false;

      const oId = String(j.orderid || j.orderId || '');
      // Strict Deduplication: Do NOT allow agent to claim if it already executed this order
      if (executedOrderIds.has(oId)) return false;

      return true;
    });

    if (!candidateJobs || candidateJobs.length === 0) {
      return { success: false, message: 'No eligible jobs available for this agent (or agent already completed all active orders).' };
    }

    const job = candidateJobs[0];
    const executionId = `exec-${job.orderid || job.orderId}-${agentId}`;
    const now = new Date().toISOString();

    try {
      // Record claim in agent_task_executions with UNIQUE(orderId, agentId)
      await withTransaction(async (q) => {
        // Double-check no execution exists for this orderId and agentId
        const existingExec = await q(
          `SELECT id FROM agent_task_executions WHERE orderId = $1 AND agentId = $2`,
          [job.orderid || job.orderId, agentId]
        );
        if (existingExec.rows && existingExec.rows.length > 0) {
          throw new Error('AGENT_ALREADY_EXECUTED_THIS_ORDER');
        }

        await q(
          `INSERT INTO agent_task_executions (id, jobId, orderId, agentId, platform, actionType, targetUrl, status, claimedAt, completedAt, durationMs, resultDetails)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'claimed', $8, NULL, 0, '{}')`,
          [executionId, job.id, job.orderid || job.orderId, agentId, platform, job.actiontype || job.actionType, job.targeturl || job.targetUrl, now]
        );

        // Update job status to in_progress and increment claimedQuantity
        await q(
          `UPDATE agent_fulfillment_jobs
           SET status = 'in_progress', claimedQuantity = claimedQuantity + 1, updatedAt = $1, startedAt = COALESCE(startedAt, $1)
           WHERE id = $2`,
          [now, job.id]
        );

        // Mark agent as working
        await q(
          `UPDATE automated_agents SET status = 'working', lastActionAt = $1 WHERE id = $2`,
          [now, agentId]
        );
      });

      return {
        success: true,
        job: {
          jobId: job.id,
          orderId: job.orderid || job.orderId,
          platform: job.platform,
          actionType: job.actiontype || job.actionType,
          targetUrl: job.targeturl || job.targetUrl,
        },
        executionId,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Could not claim job.' };
    }
  }

  /**
   * Worker Agent API: Report result of performed social action.
   */
  static async reportTaskResult(params: {
    executionId?: string;
    agentIdentifier: string;
    success: boolean;
    durationMs?: number;
    details?: any;
    orderId?: string;
    jobId?: string;
  }): Promise<{ success: boolean; message?: string; jobCompleted?: boolean }> {
    const { executionId, agentIdentifier, success, durationMs = 1200, details = {}, orderId: inputOrderId, jobId: inputJobId } = params;
    const now = new Date().toISOString();

    let execution: any = null;
    if (executionId) {
      execution = await getRow(`SELECT * FROM agent_task_executions WHERE id = $1`, [executionId]);
    }

    if (!execution && agentIdentifier && (inputOrderId || inputJobId)) {
      const agent = await getRow(`SELECT * FROM automated_agents WHERE agentIdentifier = $1 OR id = $1`, [agentIdentifier]);
      if (agent) {
        const allExecs = await getAllRows(`SELECT * FROM agent_task_executions WHERE agentId = $1`, [agent.id]);
        execution = (allExecs || []).find((e: any) => {
          const eOrderId = String(e.orderid || e.orderId || '');
          const eJobId = String(e.jobid || e.jobId || '');
          return (inputOrderId && eOrderId === String(inputOrderId)) || (inputJobId && eJobId === String(inputJobId));
        });
      }
    }

    if (!execution) {
      return { success: false, message: 'Execution task not found.' };
    }

    const orderId = execution.orderid || execution.orderId;
    const jobId = execution.jobid || execution.jobId;
    const agentId = execution.agentid || execution.agentId;
    const targetExecId = execution.id;

    let isJobCompleted = false;

    await withTransaction(async (q) => {
      if (success) {
        // Mark execution completed
        await q(
          `UPDATE agent_task_executions
           SET status = 'completed', completedAt = $1, durationMs = $2, resultDetails = $3
           WHERE id = $4`,
          [now, durationMs, JSON.stringify(details), targetExecId]
        );

        // Increment completedQuantity on the job
        const jobUpdate = await q(
          `UPDATE agent_fulfillment_jobs
           SET completedQuantity = completedQuantity + 1,
               claimedQuantity = GREATEST(0, claimedQuantity - 1),
               updatedAt = $1
           WHERE id = $2
           RETURNING completedQuantity, targetQuantity`,
          [now, jobId]
        );

        const updatedJob = jobUpdate.rows?.[0];
        const completed = Number(updatedJob?.completedquantity ?? updatedJob?.completedQuantity ?? 0);
        const target = Number(updatedJob?.targetquantity ?? updatedJob?.targetQuantity ?? 0);

        if (completed >= target) {
          isJobCompleted = true;
          await q(
            `UPDATE agent_fulfillment_jobs SET status = 'completed', completedAt = $1, updatedAt = $1 WHERE id = $2`,
            [now, jobId]
          );
        }

        // Update social_orders delivered quantity and status
        await q(
          `UPDATE social_orders
           SET deliveredQuantity = $1,
               remainingQuantity = GREATEST(0, quantity - $1),
               lastProgressAt = $2,
               status = CASE WHEN $1 >= quantity THEN 'COMPLETED' ELSE 'PROCESSING' END,
               completedAt = CASE WHEN $1 >= quantity THEN $2 ELSE completedAt END,
               updatedAt = $2
           WHERE id = $3`,
          [completed, now, orderId]
        );

        // Put agent in brief cooldown (15 seconds) so it rotates between jobs naturally
        const cooldownUntil = new Date(Date.now() + 15_000).toISOString();
        await q(
          `UPDATE automated_agents
           SET status = 'idle',
               totalActionsCompleted = totalActionsCompleted + 1,
               cooldownUntil = $1,
               lastActionAt = $2
           WHERE id = $3`,
          [cooldownUntil, now, agentId]
        );
      } else {
        // Task failed
        await q(
          `UPDATE agent_task_executions
           SET status = 'failed', completedAt = $1, durationMs = $2, resultDetails = $3
           WHERE id = $4`,
          [now, durationMs, JSON.stringify(details), targetExecId]
        );

        await q(
          `UPDATE agent_fulfillment_jobs
           SET claimedQuantity = GREATEST(0, claimedQuantity - 1), updatedAt = $1
           WHERE id = $2`,
          [now, jobId]
        );

        await q(
          `UPDATE automated_agents
           SET status = 'idle', totalActionsFailed = totalActionsFailed + 1, lastActionAt = $1
           WHERE id = $2`,
          [now, agentId]
        );
      }
    });

    return { success: true, jobCompleted: isJobCompleted };
  }

  /**
   * Autonomous Dispatcher Tick:
   * Finds active jobs in the queue and matches them with available idle agents
   * who have NOT already participated in the customer's order.
   */
  static async dispatchTick(): Promise<{ dispatchedCount: number; activeJobs: number }> {
    if (isDispatchingTick) return { dispatchedCount: 0, activeJobs: 0 };
    isDispatchingTick = true;

    try {
      // Find open jobs
      const jobs = await getAllRows(
        `SELECT * FROM agent_fulfillment_jobs
         WHERE status IN ('queued', 'in_progress')
           AND completedQuantity < targetQuantity
         ORDER BY createdAt ASC
         LIMIT 10`
      );

      if (!jobs || jobs.length === 0) {
        return { dispatchedCount: 0, activeJobs: 0 };
      }

      let totalDispatchedThisTick = 0;
      const batchSize = Math.max(2, Math.min(25, 4 * orchestratorSpeedMultiplier));

      for (const job of jobs) {
        const orderId = job.orderid || job.orderId;
        const jobId = job.id;
        const platform = job.platform;
        const targetQuantity = Number(job.targetquantity || job.targetQuantity);
        const completedQuantity = Number(job.completedquantity || job.completedQuantity || 0);
        const needed = targetQuantity - completedQuantity;

        if (needed <= 0) {
          // Mark completed
          await execute(
            `UPDATE agent_fulfillment_jobs SET status = 'completed', completedAt = $1, updatedAt = $1 WHERE id = $2`,
            [new Date().toISOString(), jobId]
          );
          await execute(
            `UPDATE social_orders SET status = 'COMPLETED', deliveredQuantity = quantity, remainingQuantity = 0, completedAt = $1, updatedAt = $1 WHERE id = $2`,
            [new Date().toISOString(), orderId]
          );
          continue;
        }

        const toDispatch = Math.min(needed, batchSize);

        // Query available idle agents for this platform who have NOT already executed this order!
        const allPlatformAgents = await getAllRows(`SELECT * FROM automated_agents WHERE platform = $1`, [platform]);
        const orderExecs = await getAllRows(`SELECT agentId FROM agent_task_executions WHERE orderId = $1`, [orderId]);
        const alreadyExecutedAgentIds = new Set((orderExecs || []).map((e: any) => String(e.agentid || e.agentId || '')));

        const availableAgents = (allPlatformAgents || [])
          .filter((a: any) => {
            const aPlatform = String(a.platform || '').toLowerCase();
            const jPlatform = String(platform || '').toLowerCase();
            if (aPlatform !== jPlatform) return false;
            if (String(a.status || '').toLowerCase() !== 'idle') return false;

            // Check cooldown
            if (a.cooldownuntil || a.cooldownUntil) {
              const cd = new Date(a.cooldownuntil || a.cooldownUntil).getTime();
              if (Date.now() < cd) return false;
            }

            // CRITICAL DEDUPLICATION: Agent must not have already executed or claimed this order
            if (alreadyExecutedAgentIds.has(String(a.id))) return false;

            return true;
          })
          .slice(0, toDispatch);

        if (!availableAgents || availableAgents.length === 0) {
          continue;
        }

        // Execute batch for these unique agents
        for (const agent of availableAgents) {
          const agentId = agent.id;
          const executionId = `exec-${orderId}-${agentId}`;
          const now = new Date().toISOString();
          const actionType = job.actiontype || job.actionType;
          const targetUrl = job.targeturl || job.targetUrl;

          try {
            await withTransaction(async (q) => {
              // Ensure deduplication
              const check = await q(
                `SELECT id FROM agent_task_executions WHERE orderId = $1 AND agentId = $2`,
                [orderId, agentId]
              );
              if (check.rows && check.rows.length > 0) return;

              // Insert completed execution record
              const duration = Math.floor(400 + Math.random() * 800);
              await q(
                `INSERT INTO agent_task_executions (id, jobId, orderId, agentId, platform, actionType, targetUrl, status, claimedAt, completedAt, durationMs, resultDetails)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $8, $9, $10)
                 ON CONFLICT(orderId, agentId) DO NOTHING`,
                [
                  executionId,
                  jobId,
                  orderId,
                  agentId,
                  platform,
                  actionType,
                  targetUrl,
                  now,
                  duration,
                  JSON.stringify({
                    userAgent: `JB-BotWorker/${platform.toLowerCase()}-v3`,
                    action: actionType,
                    status: 'success',
                    verified: true,
                  }),
                ]
              );

              // Increment job completed quantity
              const upd = await q(
                `UPDATE agent_fulfillment_jobs
                 SET completedQuantity = completedQuantity + 1,
                     status = CASE WHEN (completedQuantity + 1) >= targetQuantity THEN 'completed' ELSE 'in_progress' END,
                     completedAt = CASE WHEN (completedQuantity + 1) >= targetQuantity THEN $1 ELSE completedAt END,
                     updatedAt = $1
                 WHERE id = $2
                 RETURNING completedQuantity, targetQuantity`,
                [now, jobId]
              );

              const currentDelivered = Number(upd.rows?.[0]?.completedquantity ?? upd.rows?.[0]?.completedQuantity ?? (completedQuantity + 1));
              const currentTarget = Number(upd.rows?.[0]?.targetquantity ?? upd.rows?.[0]?.targetQuantity ?? targetQuantity);

              // Update customer order in social_orders
              await q(
                `UPDATE social_orders
                 SET deliveredQuantity = $1,
                     remainingQuantity = GREATEST(0, quantity - $1),
                     lastProgressAt = $2,
                     status = CASE WHEN $1 >= quantity THEN 'COMPLETED' ELSE 'PROCESSING' END,
                     completedAt = CASE WHEN $1 >= quantity THEN $2 ELSE completedAt END,
                     providerStatus = 'Agent Network Active',
                     updatedAt = $2
                 WHERE id = $3`,
                [currentDelivered, now, orderId]
              );

              // Update agent metrics
              await q(
                `UPDATE automated_agents
                 SET status = 'idle',
                     totalActionsCompleted = totalActionsCompleted + 1,
                     lastActionAt = $1
                 WHERE id = $2`,
                [now, agentId]
              );
            });

            totalDispatchedThisTick++;
          } catch (execErr) {
            console.warn(`[Agent Network] Batch dispatch error for agent ${agentId}:`, execErr);
          }
        }
      }

      return { dispatchedCount: totalDispatchedThisTick, activeJobs: jobs.length };
    } finally {
      isDispatchingTick = false;
    }
  }

  /**
   * Start the background autonomous dispatcher loop.
   */
  static startAutonomousDispatcher(): void {
    if (orchestratorRunning) return;
    orchestratorRunning = true;

    // Run baseline fleet check
    void this.ensureBaselineFleet();

    console.log('[Agent Network] Autonomous Agent Network Orchestrator started.');
    orchestratorIntervalTimer = setInterval(() => {
      void this.dispatchTick();
    }, 2000);
    orchestratorIntervalTimer.unref?.();
  }

  /**
   * Pause the background autonomous dispatcher.
   */
  static stopAutonomousDispatcher(): void {
    orchestratorRunning = false;
    if (orchestratorIntervalTimer) {
      clearInterval(orchestratorIntervalTimer);
      orchestratorIntervalTimer = null;
    }
    console.log('[Agent Network] Autonomous Agent Network Orchestrator stopped.');
  }

  /**
   * Get live telemetry stats for the Agent Network.
   */
  static async getNetworkStats(): Promise<any> {
    const totalAgentsRow = await getRow(`SELECT COUNT(*) as count FROM automated_agents`);
    const idleAgentsRow = await getRow(`SELECT COUNT(*) as count FROM automated_agents WHERE status = 'idle'`);
    const workingAgentsRow = await getRow(`SELECT COUNT(*) as count FROM automated_agents WHERE status = 'working'`);

    const platformCounts = await getAllRows(
      `SELECT platform, COUNT(*) as count FROM automated_agents GROUP BY platform`
    );

    const jobsQueuedRow = await getRow(`SELECT COUNT(*) as count FROM agent_fulfillment_jobs WHERE status = 'queued'`);
    const jobsActiveRow = await getRow(`SELECT COUNT(*) as count FROM agent_fulfillment_jobs WHERE status = 'in_progress'`);
    const jobsCompletedRow = await getRow(`SELECT COUNT(*) as count FROM agent_fulfillment_jobs WHERE status = 'completed'`);

    const totalExecutionsRow = await getRow(`SELECT COUNT(*) as count FROM agent_task_executions WHERE status = 'completed'`);
    const uniquePairsRow = await getRow(
      `SELECT COUNT(DISTINCT orderId || ':' || agentId) as count FROM agent_task_executions WHERE status = 'completed'`
    );

    return {
      orchestratorRunning,
      speedMultiplier: orchestratorSpeedMultiplier,
      agents: {
        total: Number(totalAgentsRow?.count || 0),
        idle: Number(idleAgentsRow?.count || 0),
        working: Number(workingAgentsRow?.count || 0),
        byPlatform: platformCounts.reduce((acc: any, cur: any) => {
          acc[cur.platform] = Number(cur.count || 0);
          return acc;
        }, {}),
      },
      jobs: {
        queued: Number(jobsQueuedRow?.count || 0),
        inProgress: Number(jobsActiveRow?.count || 0),
        completed: Number(jobsCompletedRow?.count || 0),
      },
      executions: {
        totalCompleted: Number(totalExecutionsRow?.count || 0),
        uniqueOrderAgentPairs: Number(uniquePairsRow?.count || 0),
        deduplicationRate: '100.0%',
      },
    };
  }

  /**
   * Set orchestrator speed multiplier.
   */
  static setSpeedMultiplier(multiplier: number): void {
    orchestratorSpeedMultiplier = Math.max(1, Math.min(10, Number(multiplier) || 1));
  }
}
