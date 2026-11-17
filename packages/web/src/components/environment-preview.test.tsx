/// <reference types="bun" />
import {afterEach, expect, test} from 'bun:test';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {EnvironmentKeysPreview, EnvironmentPeoplePreview} from './environment-preview';
import type {EnvironmentRow} from '@proxy/contracts/environments';

afterEach(cleanup);
const row: EnvironmentRow = {
	project: 'example-development',
	service: 'Example',
	keys: Array.from({length: 56}, (_, i) => ({name: `EXAMPLE_KEY_${i}`, label: `Example key ${i}`})),
	people: ['owner', 'member'],
	grants: [{kind: 'person', id: 'member', names: ['EXAMPLE_KEY_0']}],
	lastAccess: null,
	accesses30Days: 0,
};
test('searches every key in a large group while keeping values masked', () => {
	let opened = false;
	render(
		<EnvironmentKeysPreview
			row={row}
			onDetails={() => {
				opened = true;
			}}
		/>,
	);
	expect(screen.getAllByLabelText('Value hidden')).toHaveLength(56);
	fireEvent.change(screen.getByRole('textbox', {name: 'Find a key'}), {
		target: {value: 'EXAMPLE_KEY_55'},
	});
	expect(screen.getByText('EXAMPLE_KEY_55')).toBeTruthy();
	expect(screen.queryByText('EXAMPLE_KEY_0')).toBeNull();
	fireEvent.click(screen.getByRole('button', {name: 'Open keys and reveal values'}));
	expect(opened).toBe(true);
});
test('distinguishes owner access from a partial key grant', () => {
	render(
		<EnvironmentPeoplePreview
			row={row}
			people={[
				{userId: 'owner', name: 'Dana', email: 'dana@example.test', image: null, owner: true},
				{userId: 'member', name: 'Alex', email: 'alex@example.test', image: null, owner: false},
			]}
			canManage={false}
			onDetails={() => {}}
		/>,
	);
	expect(screen.getByText('Owner · all keys')).toBeTruthy();
	expect(screen.getByText('1 of 56 keys')).toBeTruthy();
	expect(screen.queryByRole('button', {name: 'Manage access'})).toBeNull();
});
