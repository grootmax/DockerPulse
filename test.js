// Test suite for DockerPulse logical units
import { readFileSync, existsSync } from 'fs';

// Helper to extract method bodies from extension.js to test them without running GJS
const extensionPath = existsSync('/app/extension.js') ? '/app/extension.js' : new URL('./extension.js', import.meta.url);
const code = readFileSync(extensionPath, 'utf8');

function extractMethod(code, methodName) {
    const regex = new RegExp(`\\s${methodName}\\([^)]*\\)\\s*\\{`);
    const match = regex.exec(code);
    if (!match) throw new Error(`Method definition for ${methodName} not found`);
    const startIdx = match.index + 1; // skip leading space
    
    // Find the opening brace of the method
    let braceCount = 0;
    let inMethod = false;
    let methodCode = '';
    
    for (let i = startIdx; i < code.length; i++) {
        const char = code[i];
        if (char === '{') {
            braceCount++;
            inMethod = true;
        } else if (char === '}') {
            braceCount--;
            if (inMethod && braceCount === 0) {
                methodCode += char;
                break;
            }
        }
        if (inMethod) {
            methodCode += char;
        }
    }
    
    // Convert method to standalone function
    // e.g. _parseDockerComposePsOutput(outputStr) { ... } -> function _parseDockerComposePsOutput(outputStr) { ... }
    return new Function('return function ' + methodName + '(' + code.substring(startIdx + methodName.length + 1, startIdx + methodName.length + 1 + code.substring(startIdx + methodName.length + 1).indexOf('{')).trim() + ' ' + methodCode)();
}

// Extract methods to test
const parseDockerComposePsOutput = extractMethod(code, '_parseDockerComposePsOutput');
const isContainerActive = extractMethod(code, '_isContainerActive');

let testPassed = true;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        testPassed = false;
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function runAllTests() {
    testPassed = true;
    console.log('--- Starting DockerPulse Logic Tests ---');

    // 1. Test standard JSON array parsing
    const standardJson = `[
      {"Name": "my-web-1", "State": "running", "Status": "Up 2 hours", "Health": "healthy"},
      {"Name": "my-db-1", "State": "running", "Status": "Up 2 hours", "Health": ""}
    ]`;
    const parsedArray = parseDockerComposePsOutput(standardJson);
    assert(parsedArray.length === 2, 'Parsed 2 containers from standard JSON array');
    assert(parsedArray[0].Name === 'my-web-1', 'First container name is correct');

    // 2. Test NDJSON (Newline Delimited JSON) parsing
    const ndjson = `{"Name": "my-web-1", "State": "running", "Status": "Up 2 hours", "Health": "healthy"}
    {"Name": "my-db-1", "State": "running", "Status": "Up 2 hours", "Health": ""}`;
    const parsedNdjson = parseDockerComposePsOutput(ndjson);
    assert(parsedNdjson.length === 2, 'Parsed 2 containers from NDJSON');
    assert(parsedNdjson[1].Name === 'my-db-1', 'Second container name from NDJSON is correct');

    // 3. Test invalid JSON parsing
    const invalidJson = `some non-json text`;
    const parsedInvalid = parseDockerComposePsOutput(invalidJson);
    assert(parsedInvalid.length === 0, 'Parsed empty array from invalid JSON');

    // 4. Test isContainerActive logic
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: 'healthy' }) === true, 'Active container (running, healthy)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: '' }) === true, 'Active container (running, no healthcheck)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: 'starting' }) === true, 'Active container (running, health starting)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: 'unhealthy' }) === false, 'Inactive container (running but unhealthy)');
    assert(isContainerActive({ State: 'exited', Status: 'Exited (0) 1 hour ago', Health: '' }) === false, 'Inactive container (exited)');
    assert(isContainerActive({ State: 'restarting', Status: 'Restarting (1) 1 second ago', Health: '' }) === false, 'Inactive container (restarting)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: { Status: 'healthy' } }) === true, 'Active container (running, structured healthy)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: { Status: 'unhealthy' } }) === false, 'Inactive container (running, structured unhealthy)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: { status: 'starting' } }) === true, 'Active container (running, structured starting)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: { Value: 'unhealthy' } }) === false, 'Inactive container (running, structured value unhealthy)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: true }) === true, 'Active container (running, primitive boolean health)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: 123 }) === true, 'Active container (running, primitive number health)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: null }) === true, 'Active container (running, null health)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: undefined }) === true, 'Active container (running, undefined health)');
    assert(isContainerActive({ State: 'running', Status: 'Up 10 seconds', Health: {} }) === true, 'Active container (running, empty object health)');

    // 5. Test state combinations/coloring decisions
    function decideColor(containers) {
        if (containers.length === 0) return 'red';
        let total = containers.length;
        let active = 0;
        for (const c of containers) {
            if (isContainerActive(c)) {
                active++;
            }
        }
        if (active === total) return 'green';
        if (active > 0) return 'yellow';
        return 'red';
    }

    assert(decideColor([]) === 'red', 'Empty container list results in Red (down)');
    assert(decideColor([
        { State: 'running', Status: 'Up', Health: '' },
        { State: 'running', Status: 'Up', Health: '' }
    ]) === 'green', 'All active results in Green');
    assert(decideColor([
        { State: 'running', Status: 'Up', Health: '' },
        { State: 'exited', Status: 'Exited', Health: '' }
    ]) === 'yellow', 'Partial active results in Yellow');
    assert(decideColor([
        { State: 'exited', Status: 'Exited', Health: '' },
        { State: 'exited', Status: 'Exited', Health: '' }
    ]) === 'red', 'All inactive results in Red');

    if (!testPassed) {
        throw new Error('Some assertions failed.');
    }
}

runAllTests();

if (testPassed) {
    console.log('🎉 All logic tests passed successfully!');
    if (!process.env.JEST_WORKER_ID) {
        process.exit(0);
    }
} else {
    console.error('❌ Some tests failed.');
    if (!process.env.JEST_WORKER_ID) {
        process.exit(1);
    } else {
        throw new Error('Some tests failed.');
    }
}

if (typeof test === 'function') {
    test('DockerPulse logic tests compatibility', () => {
        expect(testPassed).toBe(true);
    });
}
