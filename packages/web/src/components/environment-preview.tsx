import {useEffect, useState, type ReactNode} from 'react';
import {Popover} from '@base-ui/react/popover';
import {ChevronDownIcon} from 'lucide-react';
import {
	environmentHistorySchema,
	type EnvironmentRow,
	type environmentOverviewSchema,
} from '@proxy/contracts/environments';
import type {z} from 'zod';
import {apiRequest} from '@/client/request';
import {PersonAvatar} from '@/components/person-avatar';

type People = z.infer<typeof environmentOverviewSchema>['people'];
type History = z.infer<typeof environmentHistorySchema>['access'];

/** Hover for a glance; click/touch or Enter to interact. Never fetches secret values. */
export function EnvironmentPreview({
	label,
	title,
	trigger,
	children,
}: {
	label: string;
	title: string;
	trigger: ReactNode;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				openOnHover
				delay={250}
				closeDelay={150}
				aria-label={label}
				className="inline-flex max-w-full items-center gap-1.5 rounded-md text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
			>
				{trigger}
				<ChevronDownIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
					<Popover.Popup
						initialFocus={(type) => type === 'keyboard'}
						className="flex max-h-[min(480px,var(--available-height))] w-96 max-w-[calc(100vw-24px)] flex-col gap-3 overflow-y-auto rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
					>
						<Popover.Title className="font-medium">{title}</Popover.Title>
						{open && children}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}

export function EnvironmentKeysPreview({
	row,
	onDetails,
}: {
	row: EnvironmentRow;
	onDetails: () => void;
}) {
	const [query, setQuery] = useState('');
	const keys = row.keys.filter((key) =>
		`${key.name} ${key.label}`.toLowerCase().includes(query.toLowerCase()),
	);
	return (
		<>
			<p className="text-xs text-muted-foreground">
				{row.project} · {row.keys.length} keys · values hidden
			</p>
			<input
				aria-label="Find a key"
				placeholder="Find a key…"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				className="w-full rounded-md border bg-background px-3 py-2 text-sm"
			/>
			<ul className="flex max-h-60 flex-col gap-3 overflow-y-auto">
				{keys.map((key) => (
					<li key={key.name} className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<code className="break-all text-xs">{key.name}</code>
							<p className="text-xs text-muted-foreground">{key.label}</p>
						</div>
						<span aria-label="Value hidden" className="shrink-0 text-muted-foreground">
							••••••
						</span>
					</li>
				))}
			</ul>
			{keys.length === 0 && <p className="text-muted-foreground">No matching keys.</p>}
			<button
				onClick={onDetails}
				className="self-start text-sm font-medium underline underline-offset-4"
			>
				Open keys and reveal values
			</button>
		</>
	);
}

export function EnvironmentPeoplePreview({
	row,
	people,
	canManage,
	onDetails,
}: {
	row: EnvironmentRow;
	people: People;
	canManage: boolean;
	onDetails: () => void;
}) {
	return (
		<>
			<ul className="flex flex-col gap-3">
				{people
					.filter((person) => row.people.includes(person.userId))
					.map((person) => {
						const count = person.owner
							? row.keys.length
							: row.grants.find((grant) => grant.kind === 'person' && grant.id === person.userId)
									?.names.length;
						return (
							<li key={person.userId} className="flex items-center gap-3">
								<PersonAvatar person={person} />
								<div className="min-w-0">
									<p className="break-all">{person.name ?? person.email}</p>
									<p className="text-xs text-muted-foreground">
										{person.owner
											? 'Owner · all keys'
											: count === undefined
												? 'Shared access'
												: `${count} of ${row.keys.length} keys`}
									</p>
								</div>
							</li>
						);
					})}
			</ul>
			{canManage && (
				<button onClick={onDetails} className="self-start font-medium underline underline-offset-4">
					Manage access
				</button>
			)}
		</>
	);
}

export function EnvironmentActivityPreview({row, base}: {row: EnvironmentRow; base: string}) {
	const [history, setHistory] = useState<History | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let active = true;
		void apiRequest(
			'POST',
			`${base}/development/${encodeURIComponent(row.project)}/history`,
			environmentHistorySchema,
			{names: row.keys.map((key) => key.name)},
		).then((result) => {
			if (!active) {
				return;
			}
			if (result.isErr()) {
				setFailed(true);
				return;
			}
			setHistory(result.value.access);
		});
		return () => {
			active = false;
		};
	}, [base, row]);
	return (
		<>
			<p>
				<strong>{row.accesses30Days}</strong> successful retrievals in the last 30 days
			</p>
			<p className="text-xs text-muted-foreground">
				Proxy retrievals only. External use of copied keys is not tracked. Recent events include
				edits and permission changes.
			</p>
			{failed && <p role="alert">Could not load recent activity. Close and reopen to retry.</p>}
			{!failed && history === null && <p role="status">Loading activity…</p>}
			{history?.length === 0 && <p className="text-muted-foreground">No recorded activity.</p>}
			<ul className="flex max-h-64 flex-col gap-3 overflow-y-auto">
				{history?.slice(0, 10).map((event) => (
					<li key={event.id} className="flex flex-col gap-1 border-b border-border/40 pb-2">
						<p className="break-words font-medium">{event.actor}</p>
						<p className="text-xs">
							{event.method} · {event.allowed ? 'Allowed' : 'Denied'} · {event.names.length} keys
						</p>
						<time dateTime={event.createdAt} className="text-xs text-muted-foreground">
							{new Date(event.createdAt).toLocaleString()}
						</time>
						<p className="break-all font-mono text-xs text-muted-foreground">
							{event.names.join(', ')}
						</p>
					</li>
				))}
			</ul>
		</>
	);
}
