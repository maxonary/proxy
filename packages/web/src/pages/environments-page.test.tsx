/// <reference types="bun" />
import {afterEach, expect, spyOn, test} from 'bun:test';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {ThemeProvider} from '@proxy/ui/components/theme-provider';
import {TooltipProvider} from '@proxy/ui/components/tooltip';
import {HumanSide} from '@/components/human-side';
import {testHuman} from '@/test-org';
import {EnvironmentsPage} from './environments-page';

afterEach(cleanup);

test('expands services and keys inline, closes siblings and discards a late reveal after switching', async () => {
	let deliver: ((response: Response) => void) | undefined;
	let reveals = 0;
	const fetch = spyOn(globalThis, 'fetch').mockImplementation(
		Object.assign(
			async (input: RequestInfo | URL) => {
				const url =
					typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
				if (url.endsWith('/reveal')) {
					reveals += 1;
					return new Promise<Response>((resolve) => {
						deliver = resolve;
					});
				}
				return Response.json({
					canManage: false,
					people: [],
					rows: ['OpenAI', 'Stripe'].map((service) => ({
						project: 'example',
						service,
						keys: [1, 2].map((i) => ({
							name: `${service.toUpperCase()}_KEY_${i}`,
							label: `Key ${i}`,
						})),
						people: [],
						grants: [],
						lastAccess: null,
						accesses30Days: 0,
					})),
				});
			},
			{preconnect: globalThis.fetch.preconnect},
		),
	);
	try {
		const router = createMemoryRouter(
			[
				{
					id: 'human',
					loader: () => testHuman(),
					element: <HumanSide />,
					children: [{path: '/:org/environments', element: <EnvironmentsPage />}],
				},
			],
			{initialEntries: ['/acme/environments']},
		);
		render(
			<ThemeProvider>
				<TooltipProvider>
					<RouterProvider router={router} />
				</TooltipProvider>
			</ThemeProvider>,
		);
		const first = await screen.findByRole('button', {name: 'Open OpenAI example'});
		fireEvent.click(first);
		expect(screen.getByRole('button', {name: 'Open Stripe example'})).toBeTruthy();
		fireEvent.click(screen.getByRole('button', {name: /Key 1 OPENAI_KEY_1/}));
		fireEvent.click(screen.getByRole('button', {name: /Key 2 OPENAI_KEY_2/}));
		expect(screen.queryByRole('button', {name: 'Reveal OPENAI_KEY_1'})).toBeNull();
		expect(reveals).toBe(0);
		fireEvent.click(screen.getByRole('button', {name: 'Reveal OPENAI_KEY_2'}));
		await waitFor(() => expect(reveals).toBe(1));
		fireEvent.click(screen.getByRole('button', {name: 'Open Stripe example'}));
		expect(first.getAttribute('aria-expanded')).toBe('false');
		deliver?.(Response.json({variables: {OPENAI_KEY_2: 'invented-secret'}}));
		await waitFor(() => expect(screen.queryByText('invented-secret')).toBeNull());
		expect(router.state.location.pathname).toBe('/acme/environments');
		fireEvent.click(first);
		fireEvent.click(screen.getByRole('button', {name: /Key 2 OPENAI_KEY_2/}));
		expect(screen.queryByText('invented-secret')).toBeNull();
	} finally {
		fetch.mockRestore();
	}
});
