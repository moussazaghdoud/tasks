import { describe, expect, it } from 'vitest';
import { definitionAsked, termOf } from './trigger';

describe('a definition asked for while capturing', () => {
  it('hears the asking in six languages', () => {
    expect(definitionAsked('Define VXLAN')).toBe('VXLAN');
    expect(definitionAsked('What is EVPN?')).toBe('EVPN');
    expect(definitionAsked("what's a VLAN.")).toBe('VLAN');
    expect(definitionAsked('Définis VXLAN')).toBe('VXLAN');
    expect(definitionAsked("C'est quoi le zero trust ?")).toBe('zero trust');
    expect(definitionAsked("Qu'est-ce que l'EVPN")).toBe('EVPN');
    expect(definitionAsked("Cos'è il BGP?")).toBe('BGP');
    expect(definitionAsked('Qué es un firewall')).toBe('firewall');
    expect(definitionAsked('Was ist ein VLAN?')).toBe('VLAN');
    expect(definitionAsked('什么是VXLAN')).toBe('VXLAN');
    expect(definitionAsked('VXLAN是什么？')).toBe('VXLAN');
  });

  it('leaves tasks alone', () => {
    expect(definitionAsked('Define the budget with Paul')).toBeNull();
    expect(definitionAsked('Définir le planning')).toBeNull();
    expect(definitionAsked('Call the notary tomorrow')).toBeNull();
    expect(definitionAsked('What is the plan for the launch of the new offer next quarter')).toBeNull();
  });

  it('in the Know tab, takes the words as the term', () => {
    expect(termOf('VXLAN')).toBe('VXLAN');
    expect(termOf('Define EVPN.')).toBe('EVPN');
    expect(termOf('  zero trust  ')).toBe('zero trust');
  });
});
