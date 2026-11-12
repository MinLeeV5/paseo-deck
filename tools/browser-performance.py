"""Run through browser-harness against the isolated demo tab, not a user's tab.

BH_PERF_PHASE=before|after browser-harness <<'PY'
exec(open('tools/browser-performance.py').read())
PY
"""
import json
import os
import time
from pathlib import Path
from browser_harness.helpers import cdp


def evaluate(expression):
    response = cdp('Runtime.evaluate', expression=expression, returnByValue=True, awaitPromise=True)
    if response.get('exceptionDetails'):
        raise RuntimeError(response['exceptionDetails'].get('text', 'Browser evaluation failed'))
    return response.get('result', {}).get('value')


def metrics():
    return {m['name']: m['value'] for m in cdp('Performance.getMetrics')['metrics']}


phase = os.environ.get('BH_PERF_PHASE', 'after')
cdp('Performance.enable')
evaluate("""(() => {
  if (window.__splitBench) window.__splitBench.stop();
  const b = window.__splitBench = {writes: 0, nativeBuilds: 0, iconHookCalls: 0, messages: {}, frames: [], longTasks: []};
  const pane = [...document.querySelectorAll('[data-testid^=split-pane-]')].find(e=>e.getBoundingClientRect().width>0);
  let fiber = pane?.[Object.keys(pane).find(k=>k.startsWith('__reactFiber$'))], bridge;
  while (fiber) {if (fiber.memoizedProps?.bridge?.buildWorkspacePaneContentModel) {bridge=fiber.memoizedProps.bridge;break;} fiber=fiber.return;}
  // On the original build the bridge belongs to the board's child, not its ancestor.
  const find = node => {if (!node) return; if (node.memoizedProps?.bridge?.buildWorkspacePaneContentModel) return node.memoizedProps.bridge; return find(node.child) ?? find(node.sibling);};
  bridge ??= find(pane?.[Object.keys(pane).find(k=>k.startsWith('__reactFiber$'))]?.child);
  const build = bridge?.buildWorkspacePaneContentModel;
  if (bridge) bridge.buildWorkspacePaneContentModel = (...args) => {b.nativeBuilds++;return build(...args);};
  const iconHook = bridge?.useProjectIcons;
  if (iconHook) bridge.useProjectIcons = (...args) => {b.iconHookCalls++;return iconHook(...args);};
  const store = Storage.prototype.setItem, send = WebSocket.prototype.send;
  Storage.prototype.setItem = function(key, value) {
    if (key.startsWith('paseo-deck:board:')) b.writes++;
    return store.call(this, key, value);
  };
  WebSocket.prototype.send = function(data) {
    if (typeof data === 'string') try {
      const m = JSON.parse(data), type = m.message?.type ?? m.payload?.message?.type ?? m.payload?.type ?? m.type ?? 'unknown';
      b.messages[type] = (b.messages[type] ?? 0) + 1;
    } catch {}
    return send.call(this, data);
  };
  const observer = new PerformanceObserver(list => {
    b.longTasks.push(...list.getEntries().map(e => e.duration));
  });
  observer.observe({entryTypes: ['longtask']});
  let last = null, frame;
  const tick = now => {if (last !== null) b.frames.push(now-last); last=now; frame=requestAnimationFrame(tick);};
  frame = requestAnimationFrame(tick);
  b.stop = () => {cancelAnimationFrame(frame); observer.disconnect(); Storage.prototype.setItem=store; WebSocket.prototype.send=send; if(bridge) {bridge.buildWorkspacePaneContentModel=build; if(iconHook)bridge.useProjectIcons=iconHook;}};
  b.reset = () => {b.writes=0; b.nativeBuilds=0; b.iconHookCalls=0; b.messages={}; b.frames=[]; b.longTasks=[]; last=null;};
  b.bridgeInstrumented = Boolean(bridge);
})()""")
result = {'phase': phase, 'viewport': evaluate('[innerWidth,innerHeight]')}
result['panes'] = evaluate("[...document.querySelectorAll('[data-testid^=split-pane-]')].filter(e=>e.getBoundingClientRect().width>0).length")
if not result['panes']:
    evaluate('window.__splitBench.stop()')
    raise RuntimeError('No visible split panes; wait for the app before benchmarking')
result['chrome'] = cdp('Browser.getVersion')['product']


def sample(label, action):
    evaluate('window.__splitBench.reset()')
    start = metrics()
    started = time.monotonic()
    action()
    end = metrics()
    data = evaluate('({writes:__splitBench.writes,nativeBuilds:__splitBench.nativeBuilds,iconHookCalls:__splitBench.iconHookCalls,bridgeInstrumented:__splitBench.bridgeInstrumented,messages:__splitBench.messages,frames:__splitBench.frames,longTasks:__splitBench.longTasks})')
    elapsed = time.monotonic() - started
    frames = sorted(data.pop('frames'))
    data['seconds'] = round(elapsed, 3)
    data['mainThreadMsPerSecond'] = round((end['TaskDuration'] - start['TaskDuration']) * 1000 / elapsed, 2)
    data['layoutCount'] = end['LayoutCount'] - start['LayoutCount']
    data['frameP95Ms'] = round(frames[min(len(frames)-1, int(len(frames)*.95))], 2) if frames else None
    data['frameMaxMs'] = round(max(frames), 2) if frames else None
    data['longTasks'] = [round(v, 2) for v in data['longTasks']]
    data['heapUsedMB'] = round(cdp('Runtime.getHeapUsage')['usedSize']/1024/1024, 1)
    result[label] = data


sample('idle', lambda: time.sleep(16))
sliders = [n for n in cdp('Accessibility.getFullAXTree')['nodes'] if not n.get('ignored') and n.get('role', {}).get('value') == 'slider']
if sliders:
    q = cdp('DOM.getBoxModel', backendNodeId=sliders[0]['backendDOMNodeId'])['model']['content']
    x, y = sum(q[0::2])/4, sum(q[1::2])/4

    def drag():
        first = "document.querySelector('[data-testid^=split-pane-split]').getBoundingClientRect().width"
        before = evaluate(first)
        cdp('Input.dispatchMouseEvent', type='mousePressed', x=x, y=y, button='left', clickCount=1)
        for step in list(range(1,25))+list(range(23,-1,-1)):
            cdp('Input.dispatchMouseEvent', type='mouseMoved', x=x+step*4, y=y, button='left', buttons=1)
            time.sleep(.012)
            if step == 24:
                result['dragDeltaPx'] = round(evaluate(first) - before, 2)
        cdp('Input.dispatchMouseEvent', type='mouseReleased', x=x, y=y, button='left', clickCount=1)
        time.sleep(.6)
        if abs(result['dragDeltaPx'] - 96) > 3:
            raise RuntimeError('Divider did not follow the complete drag')

    sample('drag', drag)
evaluate('window.__splitBench.stop()')
target = Path(f'artifacts/performance-{phase}-{result["panes"]}-panes.json')
target.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
