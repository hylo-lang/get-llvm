// Copyright (c) 2024 Luca Cappa

// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { hashCode } from '../src/utils';

test('hashCode returns 0 for empty string', () => {
    expect(hashCode('')).toBe(0);
});

test('hashCode returns a non-zero value for non-empty string', () => {
    expect(hashCode('hello')).not.toBe(0);
});

test('hashCode is deterministic', () => {
    expect(hashCode('some text')).toBe(hashCode('some text'));
});

test('hashCode returns different values for different inputs', () => {
    const inputs = ['abc', 'def', 'ghi', 'xyz', '123', 'test'];
    const hashes = new Set(inputs.map(hashCode));
    expect(hashes.size).toBe(inputs.length);
});
