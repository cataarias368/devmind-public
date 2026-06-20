// ============================================================
// src/core/licensing.ts - Licensing Information
// ============================================================

/**
 * Returns licensing details for DevMind Agent.
 */
export function getLicensingInfo(): string {
  return [
    'DevMind Agent — Licensing Information',
    '=====================================',
    '',
    'License: GNU Affero General Public License v3 (AGPLv3)',
    'Copyright: Jose Luis Arias Casco',
    'Contact: cataarias368@gmail.com',
    '',
    'This program is free software: you can redistribute it and/or modify',
    'it under the terms of the GNU Affero General Public License as published',
    'by the Free Software Foundation, either version 3 of the License, or',
    '(at your option) any later version.',
    '',
    'This program is distributed in the hope that it will be useful,',
    'but WITHOUT ANY WARRANTY; without even the implied warranty of',
    'MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the',
    'GNU Affero General Public License for more details.',
    '',
    'You should have received a copy of the GNU Affero General Public License',
    'along with this program. If not, see <https://www.gnu.org/licenses/>.',
    '',
    '---',
    '',
    'Key AGPLv3 Requirements:',
    '  • Source code must be made available when distributing the software',
    '  • Modifications must be licensed under AGPLv3',
    '  • Network use constitutes distribution (Section 13)',
    '  • Changes must be documented and prominently noted',
    '',
    'For commercial licensing inquiries, contact: cataarias368@gmail.com',
  ].join('\n');
}
