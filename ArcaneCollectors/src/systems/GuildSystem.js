/**
 * GuildSystem - GP-2 Guild System
 * Singleton export pattern
 */

import { SaveManager } from './SaveManager.js';
import { supabase, isOnline } from '../api/supabaseClient.js';
import GameLogger from '../utils/GameLogger.js';

const VALID_MAX_MEMBERS = [10, 20, 30, 50];
const DONATION_RATIO = 1;
const DONATION_MIN = 100;
const DONATION_MAX = 100000;
const GUILD_NAME_MIN = 2;
const GUILD_NAME_MAX = 20;
const GUILD_DESC_MAX = 100;
const GUILD_CACHE_KEY = 'arcane_collectors_guild_cache';

export class GuildSystem {
  static async createGuild({ name, description = '', maxMembers = 30 }) {
    if (!name || name.length < GUILD_NAME_MIN || name.length > GUILD_NAME_MAX) {
      return { success: false, error: 'Invalid guild name (2-20 chars)' };
    }
    if (description.length > GUILD_DESC_MAX) {
      return { success: false, error: 'Description too long (max 100)' };
    }
    if (!VALID_MAX_MEMBERS.includes(maxMembers)) {
      return { success: false, error: 'maxMembers must be 10/20/30/50' };
    }
    const saveData = SaveManager.load();
    const userId = SaveManager._userId;
    const playerName = (saveData.player && saveData.player.name) || 'Adventurer';
    const cache = GuildSystem._loadCache();
    if (cache.myGuildId) {
      return { success: false, error: 'Already in a guild' };
    }
    const guildData = {
      name: name.trim(), description: description.trim(),
      max_members: maxMembers, guild_points: 0,
      master_id: userId, master_name: playerName, member_count: 1
    };
    if (!isOnline() || !supabase) {
      const lg = Object.assign({}, guildData, { id: 'local_' + Date.now(), created_at: new Date().toISOString() });
      cache.myGuildId = lg.id; cache.myGuild = lg; cache.myRole = 'master';
      GuildSystem._saveCache(cache);
      return { success: true, guild: lg, offline: true };
    }
    try {
      const res = await supabase.from('guilds').insert(guildData).select().single();
      if (res.error) {
        if (res.error.code === '23505') return { success: false, error: 'Name taken' };
        return { success: false, error: res.error.message };
      }
      const guild = res.data;
      const cp = GuildSystem._getPlayerCombatPower(saveData);
      await supabase.from('guild_members').insert({ guild_id: guild.id, user_id: userId, player_name: playerName, role: 'master', combat_power: cp, total_donation: 0 });
      cache.myGuildId = guild.id; cache.myGuild = guild; cache.myRole = 'master';
      GuildSystem._saveCache(cache);
      return { success: true, guild };
    } catch (err) { return { success: false, error: err.message }; }
  }
  static async joinGuild(guildId) {
    if (!guildId) return { success: false, error: 'No guild ID' };
    const saveData = SaveManager.load();
    const userId = SaveManager._userId;
    const playerName = (saveData.player && saveData.player.name) || 'Adventurer';
    const cache = GuildSystem._loadCache();
    if (cache.myGuildId) return { success: false, error: 'Already in a guild' };
    if (!isOnline() || !supabase) {
      cache.myGuildId = guildId; cache.myRole = 'member';
      GuildSystem._saveCache(cache);
      return { success: true, offline: true };
    }
    try {
      const gRes = await supabase.from('guilds').select('id, name, max_members, member_count').eq('id', guildId).single();
      const guild = gRes.data;
      if (gRes.error || !guild) return { success: false, error: 'Guild not found' };
      if (guild.member_count >= guild.max_members) return { success: false, error: 'Guild is full' };
      const cp = GuildSystem._getPlayerCombatPower(saveData);
      const mRes = await supabase.from('guild_members').insert({ guild_id: guildId, user_id: userId, player_name: playerName, role: 'member', combat_power: cp, total_donation: 0 });
      if (mRes.error) {
        if (mRes.error.code === '23505') return { success: false, error: 'Already a member' };
        return { success: false, error: mRes.error.message };
      }
      await supabase.from('guilds').update({ member_count: guild.member_count + 1 }).eq('id', guildId);
      cache.myGuildId = guildId; cache.myGuild = guild; cache.myRole = 'member';
      GuildSystem._saveCache(cache);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }
  static async leaveGuild() {
    const userId = SaveManager._userId;
    const cache = GuildSystem._loadCache();
    if (!cache.myGuildId) return { success: false, error: 'Not in a guild' };
    if (cache.myRole === 'master') {
      return { success: false, error: 'Master cannot leave. Disband or transfer.' };
    }
    if (!isOnline() || !supabase) {
      delete cache.myGuildId; delete cache.myGuild; delete cache.myRole;
      GuildSystem._saveCache(cache);
      return { success: true, offline: true };
    }
    try {
      const guildId = cache.myGuildId;
      const del = await supabase.from('guild_members').delete().eq('user_id', userId).eq('guild_id', guildId);
      if (del.error) return { success: false, error: del.error.message };
      const cRes = await supabase.from('guilds').select('member_count').eq('id', guildId).single();
      const g = cRes.data;
      if (g && g.member_count > 1) {
        await supabase.from('guilds').update({ member_count: g.member_count - 1 }).eq('id', guildId);
      }
      delete cache.myGuildId; delete cache.myGuild; delete cache.myRole;
      GuildSystem._saveCache(cache);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }
  static async kickMember(targetUserId) {
    if (!targetUserId) return { success: false, error: 'No target ID' };
    const userId = SaveManager._userId;
    const cache = GuildSystem._loadCache();
    if (cache.myRole !== 'master') return { success: false, error: 'Only master can kick' };
    if (targetUserId === userId) return { success: false, error: 'Cannot kick yourself' };
    if (!isOnline() || !supabase) return { success: false, error: 'Cannot kick offline' };
    try {
      const guildId = cache.myGuildId;
      const del = await supabase.from('guild_members').delete().eq('user_id', targetUserId).eq('guild_id', guildId);
      if (del.error) return { success: false, error: del.error.message };
      const cRes = await supabase.from('guilds').select('member_count').eq('id', guildId).single();
      const g = cRes.data;
      if (g && g.member_count > 1) {
        await supabase.from('guilds').update({ member_count: g.member_count - 1 }).eq('id', guildId);
      }
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }
  static async getGuildMembers(guildId) {
    const targetId = guildId || GuildSystem._loadCache().myGuildId;
    if (!targetId) return { success: false, error: 'No guild ID', members: [] };
    if (!isOnline() || !supabase) return { success: true, members: [], offline: true };
    try {
      const res = await supabase.from('guild_members')
        .select('user_id, player_name, role, combat_power, total_donation, joined_at')
        .eq('guild_id', targetId)
        .order('combat_power', { ascending: false });
      if (res.error) return { success: false, members: [], error: res.error.message };
      return { success: true, members: res.data || [] };
    } catch (err) { return { success: false, members: [], error: err.message }; }
  }
  static async donate(amount) {
    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount < DONATION_MIN || parsedAmount > DONATION_MAX) {
      return { success: false, error: 'Donation: ' + DONATION_MIN + '-' + DONATION_MAX + ' gold' };
    }
    const saveData = SaveManager.load();
    const userId = SaveManager._userId;
    const cache = GuildSystem._loadCache();
    if (!cache.myGuildId) return { success: false, error: 'Not in a guild' };
    const currentGold = (saveData.player && saveData.player.gold) || 0;
    if (currentGold < parsedAmount) {
      return { success: false, error: 'Not enough gold (' + currentGold + ')' };
    }
    const pointsEarned = Math.floor(parsedAmount * DONATION_RATIO);
    const guildId = cache.myGuildId;
    if (!isOnline() || !supabase) {
      if (saveData.player) { saveData.player.gold = currentGold - parsedAmount; SaveManager.save(saveData); }
      return { success: true, pointsEarned, offline: true };
    }
    try {
      const gRes = await supabase.from('guilds').select('guild_points').eq('id', guildId).single();
      const newGP = ((gRes.data && gRes.data.guild_points) || 0) + pointsEarned;
      const mRes = await supabase.from('guild_members').select('total_donation').eq('user_id', userId).eq('guild_id', guildId).single();
      const newTD = ((mRes.data && mRes.data.total_donation) || 0) + parsedAmount;
      await Promise.all([
        supabase.from('guilds').update({ guild_points: newGP }).eq('id', guildId),
        supabase.from('guild_members').update({ total_donation: newTD }).eq('user_id', userId).eq('guild_id', guildId)
      ]);
      if (saveData.player) { saveData.player.gold = currentGold - parsedAmount; SaveManager.save(saveData); }
      return { success: true, pointsEarned, newGuildPoints: newGP };
    } catch (err) { return { success: false, error: err.message }; }
  }
  static async getMyGuildInfo() {
    const cache = GuildSystem._loadCache();
    if (!cache.myGuildId) return { success: false, guild: null, error: 'Not in a guild' };
    if (!isOnline() || !supabase) return { success: true, guild: cache.myGuild || null, offline: true };
    try {
      const res = await supabase.from('guilds')
        .select('id, name, description, max_members, guild_points, master_name, member_count, created_at')
        .eq('id', cache.myGuildId).single();
      if (res.error) return { success: false, guild: null, error: res.error.message };
      cache.myGuild = res.data; GuildSystem._saveCache(cache);
      return { success: true, guild: res.data };
    } catch (err) { return { success: false, guild: null, error: err.message }; }
  }
  static async getGuildList(limit = 20) {
    if (!isOnline() || !supabase) return { success: true, guilds: [], offline: true };
    try {
      const res = await supabase.from('guilds')
        .select('id, name, description, max_members, guild_points, master_name, member_count')
        .order('guild_points', { ascending: false }).limit(limit);
      if (res.error) return { success: false, guilds: [], error: res.error.message };
      return { success: true, guilds: res.data || [] };
    } catch (err) { return { success: false, guilds: [], error: err.message }; }
  }
  static _getPlayerCombatPower(saveData) {
    try {
      const ids = (saveData.parties && saveData.parties[0]) || [];
      const chars = saveData.characters || [];
      const party = ids.map(function(id) { return chars.find(function(c) { return c.id === id; }); }).filter(Boolean);
      if (!party.length) return 0;
      return party.reduce(function(s, c) {
        const st = c.stats || {}; const lv = c.level || 1;
        return s + ((st.hp || 1000) + (st.atk || 100) * 2 + (st.def || 50)) * lv;
      }, 0);
    } catch (e) { return 0; }
  }

  static _loadCache() {
    try {
      const raw = localStorage.getItem(GUILD_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  static _saveCache(cache) {
    try { localStorage.setItem(GUILD_CACHE_KEY, JSON.stringify(cache)); }
    catch (e) {}
  }
}

export const guildSystem = GuildSystem;
export default GuildSystem;