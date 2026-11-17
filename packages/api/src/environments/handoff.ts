import {randomBytes} from 'node:crypto';
import type {Request, Response} from 'express';
import {z} from 'zod';
import {Err, Result} from 'ts-results-es';
import {db} from '@proxy/db';
import type {SignedInAgent} from '@proxy/db/agent';
import {ApiErr, type ApiError, Do, parseSchema} from '@proxy/utils';
import {hashToken} from '../auth/session';
import {requireAppUrl} from '../oauth/oauth-config';
import {decryptSecret} from '../utils/secret-crypto';
import {sendResult} from '../server/response';
import {variablesSchema} from './variables';

const failure = () => ApiErr.internalError(new Error('Environment handoff failed'));
const TTL = 5 * 60 * 1000;

export function listAgentEnvironments(agent: SignedInAgent) {
	return Do<object, ApiError>(async ($) => {
		const grants = $(
			(
				await Result.wrapAsync(() =>
					db.developmentEnvironmentGrant.findMany({where: {agentId: agent.agentId, environment: {orgId: agent.orgId}}, include: {environment: {select: {project: true, names: true}}}}),
				)
			).mapErr(failure),
		);
		return {environments: grants.map((g) => ({project: g.environment.project, names: g.names.filter((n) => g.environment.names.includes(n))})).filter((g) => g.names.length > 0)};
	});
}

export function prepareEnvironment(agent: SignedInAgent, project: string) {
	return Do<object, ApiError>(async ($) => {
		if (!agent.oauthGrantId) {
			return $(Err(ApiErr.forbidden()));
		}
		const authorization = $(
			(
				await Result.wrapAsync(() => db.oAuthGrant.findFirst({where: {id: agent.oauthGrantId, agentId: agent.agentId, accessExpires: {gt: new Date()}, agent: {revokedAt: null, orgId: agent.orgId}}}))
			).mapErr(failure),
		);
		if (!authorization) {
			return $(Err(ApiErr.unauthenticated()));
		}
		const url = $(requireAppUrl());
		const grant = $(
			(
				await Result.wrapAsync(() =>
					db.developmentEnvironmentGrant.findFirst({where: {agentId: agent.agentId, environment: {orgId: agent.orgId, project}}, include: {environment: {select: {names: true}}}}),
				)
			).mapErr(failure),
		);
		const names = grant?.names.filter((n) => grant.environment.names.includes(n)) ?? [];
		if (!names.length) {
			return $(Err(ApiErr.forbidden()));
		}
		const token = randomBytes(32).toString('hex');
		const expiresAt = new Date(Date.now() + TTL);
		$(
			(
				await Result.wrapAsync(() =>
					db.$transaction(async (tx) => {
						await tx.environmentHandoff.deleteMany({where: {OR: [{expiresAt: {lt: new Date()}}, {agentId: agent.agentId, project}]}});
						await tx.environmentHandoff.create({data: {oauthGrantId: authorization.id, tokenHash: hashToken(token), agentId: agent.agentId, project, names, expiresAt}});
					}),
				)
			).mapErr(failure),
		);
		return {
			url,
			launcherUrl: new URL('/api/environment-launcher.mjs', url).toString(),
			project,
			token,
			names,
			expiresAt: expiresAt.toISOString(),
			instructions: 'Send token to proxy.mjs run --handoff-stdin on stdin. Single use; no CLI login. Do not log or persist this credential.',
		};
	});
}

export function redeemEnvironmentHandoff(body: object): Promise<Result<{variables: Record<string, string>}, ApiError>> {
	return Do(async ($) => {
		const {token, project} = $(parseSchema(z.object({token: z.string().regex(/^[a-f0-9]{64}$/), project: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)}), body));
		const stored = $(
			(
				await Result.wrapAsync(() =>
					db.$transaction(async (tx) => {
						const handoff = await tx.environmentHandoff.findUnique({where: {tokenHash: hashToken(token)}, include: {agent: true, oauthGrant: true}});
						if (!handoff || handoff.project !== project || handoff.expiresAt <= new Date() || handoff.oauthGrant.refreshExpires <= new Date()) {
							return null;
						}
						const consumed = await tx.environmentHandoff.deleteMany({where: {tokenHash: handoff.tokenHash, expiresAt: {gt: new Date()}}});
						if (consumed.count !== 1) {
							return null;
						}
						const environment = await tx.developmentEnvironment.findUnique({where: {orgId_project: {orgId: handoff.agent.orgId, project}}, include: {grants: {where: {agentId: handoff.agentId}}}});
						const names = handoff.agent.revokedAt ? [] : handoff.names.filter((n) => environment?.names.includes(n) && environment.grants[0]?.names.includes(n));
						await tx.environmentAccess.create({data: {orgId: handoff.agent.orgId, agentId: handoff.agentId, project, names, allowed: names.length > 0, method: 'runtime'}});
						if (!environment || !names.length) {
							return null;
						}
						return {ciphertext: environment.ciphertext, names};
					}),
				)
			).mapErr(failure),
		);
		if (!stored) {
			return $(Err(ApiErr.forbidden()));
		}
		const plaintext = $(decryptSecret(stored.ciphertext));
		const variables = $(parseSchema(variablesSchema, $(Result.wrap(() => JSON.parse(plaintext)).mapErr(failure))));
		return {variables: Object.fromEntries(Object.entries(variables).filter(([name]) => stored.names.includes(name)))};
	});
}

export async function handleEnvironmentHandoff(req: Request, res: Response) {
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('Referrer-Policy', 'no-referrer');
	sendResult(res, await redeemEnvironmentHandoff(req.body));
}
