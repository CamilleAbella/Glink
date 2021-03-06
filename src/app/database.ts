import Discord from "discord.js"
import Enmap from "enmap"

//# Exemple with Enmap:

/** Enmap<Guild, Prefix> */
export const prefixes = new Enmap<Discord.Snowflake, string>({
  name: "prefixes",
})

/**
 * Enmap<User, Network>
 */
export const networks = new Enmap<Discord.Snowflake, Network>({
  name: "networks",
})

/**
 * Enmap<Channel, Hub>
 */
export const hubs = new Enmap<Discord.Snowflake, Hub>({
  name: "hubs",
})

/**
 * Enmap<Network, Mutes>
 */
export const mutes = new Enmap<Discord.Snowflake, Mute[]>({
  name: "mutes",
})

export interface Network {
  password?: string
  displayName: string
}

export interface Hub {
  networkId: Discord.Snowflake
  inviteLink?: string
}

export interface Mute {
  userId: Discord.Snowflake
  reason?: string
  date: number
}

// Docs: https://enmap.evie.dev/
