import type { Emitter, ItemColor, ItemShape, Receiver, Scanner, WorldState } from './types.ts';
import { html, render } from 'lit-html';
import { propertyRegistry, requestRegistry } from './registry.ts';

// ---------------------------------------------------------------------------
// Scanner / filter dialog
// ---------------------------------------------------------------------------

export function openScannerDialog(
  scanner: Scanner,
  onClose?: () => void,
): void {
  openFilterDialog('Scanner Predicate', scanner, onClose);
}

function openFilterDialog(
  title: string,
  target: { filterProperty?: string; filterValue?: string },
  onClose?: () => void,
): void {
  document.querySelector('#sorter-dialog')?.remove();

  const allProperties = propertyRegistry.getAllProperties();
  const dialog = document.createElement('div');
  dialog.id = 'sorter-dialog';
  document.body.appendChild(dialog);
  dialog.style.left = `${window.innerWidth / 2 - 120}px`;
  dialog.style.top  = `${window.innerHeight / 2 - 80}px`;

  const close = () => { dialog.remove(); onClose?.(); };

  const renderDialog = () => {
    const currentProp =
      allProperties.find(p => p.id === target.filterProperty) ?? allProperties[0];
    const valueKeys = currentProp ? Object.keys(currentProp.values) : [];

    render(html`
      <div class="sorter-dialog-header">
        <span>${title}</span>
        <button aria-label="Close" @click=${close}>&times;</button>
      </div>
      <div class="sorter-dialog-body">
        <label>Property
          <select @change=${(e: Event) => {
            target.filterProperty = (e.target as HTMLSelectElement).value;
            const propDef = allProperties.find(p => p.id === target.filterProperty);
            target.filterValue = propDef ? Object.keys(propDef.values)[0] : undefined;
            renderDialog();
          }}>
            ${allProperties.map(p => html`
              <option value="${p.id}" ?selected=${target.filterProperty === p.id}>${p.name}</option>
            `)}
          </select>
        </label>
        <label>Value
          <select @change=${(e: Event) => {
            target.filterValue = (e.target as HTMLSelectElement).value;
          }}>
            ${valueKeys.map(v => html`
              <option value="${v}" ?selected=${target.filterValue === v}>${v}</option>
            `)}
          </select>
        </label>
        <button @click=${() => {
          target.filterProperty = undefined;
          target.filterValue = undefined;
          close();
        }}>Clear filter (pass all)</button>
      </div>
    `, dialog);
  };

  renderDialog();
}

// ---------------------------------------------------------------------------
// Receiver request selection dialog
// ---------------------------------------------------------------------------

export function openReceiverDialog(
  receiver: Receiver,
  world: WorldState,
  onClose?: () => void,
): void {
  document.querySelector('#sorter-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.id = 'sorter-dialog';
  document.body.appendChild(dialog);
  dialog.style.left = `${window.innerWidth / 2 - 120}px`;
  dialog.style.top  = `${window.innerHeight / 2 - 150}px`;

  const allAvailable = [requestRegistry.getDefaultRequest(), ...world.requests];
  const close = () => { dialog.remove(); onClose?.(); };

  render(html`
    <div class="sorter-dialog-header">
      <span>Select Request</span>
      <button aria-label="Close" @click=${close}>&times;</button>
    </div>
    <div class="sorter-dialog-body" style="max-height: 300px; overflow-y: auto; padding:0;">
      ${allAvailable.map(req => html`
        <div
          class=${'receiver-dialog-item' + (receiver.request.id === req.id ? ' selected' : '')}
          @click=${() => { receiver.request = req; close(); }}
        >
          <div style="font-weight:bold; color:#4f4">${req.name}</div>
          <div style="font-size:11px; color:#aaa">$${req.cost} reward</div>
        </div>
      `)}
    </div>
  `, dialog);
}

// ---------------------------------------------------------------------------
// Emitter sequence editor dialog
// ---------------------------------------------------------------------------

const SHAPE_OPTIONS: ItemShape[] = ['circle', 'square', 'triangle'];
const COLOR_OPTIONS: ItemColor[] = ['red', 'green', 'blue'];

export function openEmitterDialog(
  emitter: Emitter,
  onClose?: () => void,
): void {
  document.querySelector('#sorter-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.id = 'sorter-dialog';
  document.body.appendChild(dialog);
  dialog.style.left = `${window.innerWidth / 2 - 180}px`;
  dialog.style.top  = `${window.innerHeight / 2 - 180}px`;

  const ensureNonEmpty = () => {
    if (emitter.sequence.length === 0) {
      emitter.sequence.push({ shape: 'circle', color: 'red' });
      emitter.nextSequenceIndex = 0;
    }
  };

  const close = () => { dialog.remove(); onClose?.(); };
  const swap = (a: number, b: number) => {
    const tmp = emitter.sequence[a];
    emitter.sequence[a] = emitter.sequence[b];
    emitter.sequence[b] = tmp;
  };

  const renderDialog = () => {
    ensureNonEmpty();

    render(html`
      <div class="sorter-dialog-header">
        <span>Emitter Sequence</span>
        <button aria-label="Close" @click=${close}>&times;</button>
      </div>
      <div class="sorter-dialog-body">
        <div class="emitter-sequence-list">
          ${emitter.sequence.map((entry, index) => html`
            <div class="emitter-sequence-row">
              <div class="emitter-sequence-index">#${index + 1}</div>
              <label>Shape
                <select @change=${(e: Event) => {
                  entry.shape = (e.target as HTMLSelectElement).value as ItemShape;
                  renderDialog();
                }}>
                  ${SHAPE_OPTIONS.map(shape => html`
                    <option value=${shape} ?selected=${entry.shape === shape}>${shape}</option>
                  `)}
                </select>
              </label>
              <label>Color
                <select @change=${(e: Event) => {
                  entry.color = (e.target as HTMLSelectElement).value as ItemColor;
                  renderDialog();
                }}>
                  ${COLOR_OPTIONS.map(color => html`
                    <option value=${color} ?selected=${entry.color === color}>${color}</option>
                  `)}
                </select>
              </label>
              <div class="emitter-sequence-actions">
                <button
                  ?disabled=${index === 0}
                  @click=${() => {
                    if (index === 0) return;
                    swap(index, index - 1);
                    renderDialog();
                  }}
                >Up</button>
                <button
                  ?disabled=${index === emitter.sequence.length - 1}
                  @click=${() => {
                    if (index === emitter.sequence.length - 1) return;
                    swap(index, index + 1);
                    renderDialog();
                  }}
                >Down</button>
                <button
                  @click=${() => {
                    emitter.sequence.splice(index, 1);
                    if (emitter.nextSequenceIndex > emitter.sequence.length - 1) {
                      emitter.nextSequenceIndex = 0;
                    }
                    renderDialog();
                  }}
                >Delete</button>
              </div>
            </div>
          `)}
        </div>

        <div class="emitter-sequence-footer">
          <button @click=${() => {
            emitter.sequence.push({ shape: 'circle', color: 'red' });
            renderDialog();
          }}>Add Item</button>
          <button @click=${close}>Done</button>
        </div>
      </div>
    `, dialog);
  };

  renderDialog();
}
