import test from 'node:test';
import assert from 'node:assert/strict';
import { MENTAL_DIRECTIVE_SETTINGS, MENTAL_DIRECTIVES_RESET_VERSION, resetMentalDirectivesOnce } from '../../quick-reply-ext/src/mentalDirectives.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

test('one-time reset disables all current settings and clears every cached payload', () => {
    const values = new Map(MENTAL_DIRECTIVE_SETTINGS.flatMap(([toggle,payload])=>[[toggle,'Enabled'],[payload,'OLD_PAYLOAD']]));
    const get = key=>values.get(key), set = (key,value)=>values.set(key,value);
    assert.equal(resetMentalDirectivesOnce(get,set),true);
    for (const [toggle,payload] of MENTAL_DIRECTIVE_SETTINGS) {
        assert.equal(values.get(toggle),'Disabled');
        assert.equal(values.get(payload),'');
    }
    values.set('SecretsToggle','Enabled');
    values.set('SBC','MANUALLY_ENABLED');
    assert.equal(resetMentalDirectivesOnce(get,set),false);
    assert.equal(values.get('SecretsToggle'),'Enabled');
    assert.equal(values.get('SBC'),'MANUALLY_ENABLED');
    assert.equal(values.get(MENTAL_DIRECTIVES_RESET_VERSION),'1');
});

test('a prompt rebuild resets an unmigrated account and preserves manual choices after migration', async () => {
    const {globals} = await assemble('Rosa',{MentalDirectivesReset20261005:'',SecretsToggle:'Enabled',SBC:'STALE_PAYLOAD'});
    assert.equal(globals.get('SecretsToggle'),'Disabled');
    assert.equal(globals.get('SBC'),'');
    const migrated = await assemble('Rosa',Object.fromEntries([...globals,['SecretsToggle','Enabled'],['SBC','MANUAL_PAYLOAD']]));
    assert.equal(migrated.globals.get('SecretsToggle'),'Enabled');
    assert.equal(migrated.globals.get('SBC'),'MANUAL_PAYLOAD');
});
