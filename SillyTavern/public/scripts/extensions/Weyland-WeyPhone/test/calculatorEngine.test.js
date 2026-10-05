import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduceKeypress } from '../lib/calculatorEngine.js';

function press(...keys) {
    return keys.reduce(reduceKeypress, initialState());
}

test('basic arithmetic', () => {
    assert.equal(press('2', '+', '3', '=').display, '5');
    assert.equal(press('9', '-', '4', '=').display, '5');
    assert.equal(press('6', '×', '7', '=').display, '42');
    assert.equal(press('9', '÷', '3', '=').display, '3');
});

test('multi-digit and decimal entry with single-point guard', () => {
    assert.equal(press('1', '2', '.', '5').display, '12.5');
    assert.equal(press('1', '.', '.', '5').display, '1.5');
    assert.equal(press('.', '5').display, '0.5');
});

test('chained operations resolve left to right', () => {
    assert.equal(press('2', '+', '3', '×').display, '5'); // pending × on 5
    assert.equal(press('2', '+', '3', '×', '4', '=').display, '20');
});

test('divide by zero errors and only C recovers', () => {
    const err = press('5', '÷', '0', '=');
    assert.equal(err.display, 'Error');
    assert.equal(reduceKeypress(err, '7').display, 'Error');
    assert.equal(reduceKeypress(err, 'C').display, '0');
});

test('operator swap, sign flip, percent, backspace', () => {
    assert.equal(press('8', '+', '×', '2', '=').display, '16'); // + swapped to ×
    assert.equal(press('5', '±').display, '-5');
    assert.equal(press('5', '±', '±').display, '5');
    assert.equal(press('5', '0', '%').display, '0.5');
    assert.equal(press('1', '2', '3', '⌫').display, '12');
    assert.equal(press('5', '⌫', '⌫').display, '0');
});

test('float noise is trimmed', () => {
    assert.equal(press('0', '.', '1', '+', '0', '.', '2', '=').display, '0.3');
});

test('equals with no pending op is a no-op; repeated equals stays stable', () => {
    assert.equal(press('7', '=').display, '7');
    assert.equal(press('2', '+', '3', '=', '=').display, '5');
});

test('display length cap prevents runaway digits', () => {
    const state = press(...'12345678901234567890'.split(''));
    assert.ok(state.display.length <= 10);
});
