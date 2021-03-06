import * as app from "../app"
import yargsParser from "yargs-parser"

const listener: app.Listener<"message"> = {
  event: "message",
  async run(message) {
    if (!app.isCommandMessage(message)) return

    const prefix = await app.prefix(message.guild)

    if (message.content.startsWith(prefix)) {
      message.content = message.content.slice(prefix.length)
    } else if (!message.author.bot) {
      // messaging
      const hub = app.hubs.get(message.channel.id)
      if (hub) {
        const mutes = app.mutes.ensure(hub.networkId, [])

        if (mutes.some((mute) => mute.userId === message.author.id))
          return message.delete()

        const hubs = app.hubs.filter((_hub) => {
          return hub.networkId === _hub.networkId
        })
        await app.sendToHubs(message, hubs, hub.inviteLink)
      }
      return
    }

    let key = message.content.split(/\s+/)[0]
    let cmd = app.commands.resolve(key)

    if (!cmd) return

    // check sub commands
    {
      let cursor = 0
      let depth = 0

      while (cmd.subs && cursor < cmd.subs.length) {
        const subKey = message.content.split(/\s+/)[depth + 1]

        for (let sub of cmd.subs) {
          sub = app.resolve(sub)
          if (sub.name === subKey) {
            key += ` ${subKey}`
            cursor = 0
            cmd = sub
            depth++
            break
          } else if (sub.aliases) {
            for (const alias of sub.aliases) {
              if (alias === subKey) {
                key += ` ${subKey}`
                cursor = 0
                cmd = sub
                depth++
              }
            }
          }
          cursor++
        }
      }
    }

    // turn ON/OFF
    if (key !== "turn" && !app.cache.ensure("turn", true)) return

    // coolDown
    {
      const coolDownId = `${cmd.name}:${message.channel.id}`
      const coolDown = app.cache.ensure("CD-" + coolDownId, {
        time: 0,
        trigger: false,
      })

      if (cmd.coolDown && coolDown.trigger) {
        if (Date.now() > coolDown.time + cmd.coolDown) {
          app.cache.set("CD-" + coolDownId, {
            time: 0,
            trigger: false,
          })
        } else {
          return message.channel.send(
            new app.MessageEmbed()
              .setColor("RED")
              .setAuthor(
                `Please wait ${Math.ceil(
                  (coolDown.time + cmd.coolDown - Date.now()) / 1000
                )} seconds...`,
                message.client.user?.displayAvatarURL()
              )
          )
        }
      }
    }

    if (cmd.botOwner)
      if (process.env.OWNER !== message.member.id)
        return await message.channel.send(
          new app.MessageEmbed()
            .setColor("RED")
            .setAuthor(
              "You must be my owner.",
              message.client.user?.displayAvatarURL()
            )
        )

    if (cmd.guildOwner)
      if (
        message.guild.owner !== message.member &&
        process.env.OWNER !== message.member.id
      )
        return await message.channel.send(
          new app.MessageEmbed()
            .setColor("RED")
            .setAuthor(
              "You must be the guild owner.",
              message.client.user?.displayAvatarURL()
            )
        )

    if (cmd.networkOwner)
      if (!app.networks.has(message.author.id))
        return await message.channel.send(
          new app.MessageEmbed()
            .setColor("RED")
            .setAuthor(
              "You must have setup a network.",
              message.client.user?.displayAvatarURL()
            )
        )

    if (cmd.hubOnly)
      if (!app.hubs.has(message.channel.id))
        return await message.channel.send(
          new app.MessageEmbed()
            .setColor("RED")
            .setAuthor(
              "You must use this command in a hub.",
              message.client.user?.displayAvatarURL()
            )
        )

    if (cmd.botPermissions)
      for (const permission of cmd.botPermissions)
        if (
          !message.guild.me?.hasPermission(permission, {
            checkAdmin: true,
            checkOwner: true,
          })
        )
          return await message.channel.send(
            new app.MessageEmbed()
              .setColor("RED")
              .setAuthor(
                `I need the \`${permission}\` permission to call this command.`,
                message.client.user?.displayAvatarURL()
              )
          )

    if (cmd.userPermissions)
      for (const permission of cmd.userPermissions)
        if (
          !message.member.hasPermission(permission, {
            checkAdmin: true,
            checkOwner: true,
          })
        )
          return await message.channel.send(
            new app.MessageEmbed()
              .setColor("RED")
              .setAuthor(
                `You need the \`${permission}\` permission to call this command.`,
                message.client.user?.displayAvatarURL()
              )
          )

    // parse CommandMessage arguments
    {
      message.content = message.content.slice(key.length).trim()
      message.args = yargsParser(message.content) as app.CommandMessage["args"]
      message.rest = message.args._?.join(" ") ?? ""
      message.positional = (message.args._?.slice(0) ?? []).map(
        (positional) => {
          if (/^(?:".+"|'.+')$/.test(positional))
            return positional.slice(1, positional.length - 1)
          return positional
        }
      )
    }

    if (cmd.positional) {
      for (const positional of cmd.positional) {
        const index = cmd.positional.indexOf(positional)

        const getValue = () => message.positional[positional.name]
        const setValue = (value: any) => {
          message.positional[positional.name] = value
          message.positional[index] = value
        }

        const given = message.positional[index] !== undefined

        message.positional[positional.name] = message.positional[index]

        if (!given) {
          if (positional.default !== undefined) {
            setValue(
              typeof positional.default === "function"
                ? await positional.default(message)
                : positional.default
            )
          } else if (positional.required) {
            return await message.channel.send(
              new app.MessageEmbed()
                .setColor("RED")
                .setAuthor(
                  `Missing positional "${positional.name}"`,
                  message.client.user?.displayAvatarURL()
                )
                .setDescription(
                  positional.description
                    ? "Description: " + positional.description
                    : `Example: \`--${positional.name}=someValue\``
                )
            )
          }
        } else if (positional.checkValue) {
          const checked = await app.checkValue(
            positional,
            "positional",
            getValue(),
            message
          )

          if (!checked) return
        }

        if (positional.castValue) {
          const casted = await app.castValue(
            positional,
            "positional",
            getValue(),
            message,
            setValue
          )

          if (!casted) return
        }

        message.rest = message.rest
          .replace(message.args._?.[index] ?? "", "")
          .trim()
      }
    }

    if (cmd.args) {
      for (const arg of cmd.args) {
        const value = () => message.args[arg.name]

        let usedName = arg.name
        let given = message.args.hasOwnProperty(arg.name)

        if (!given && arg.aliases) {
          if (typeof arg.aliases === "string") {
            usedName = arg.aliases
            given = message.args.hasOwnProperty(arg.aliases)
          } else {
            for (const alias of arg.aliases) {
              if (message.args.hasOwnProperty(alias)) {
                usedName = alias
                given = true
                break
              }
            }
          }
        }

        if (!given && arg.isFlag && arg.flag) {
          usedName = arg.flag
          given = message.args.hasOwnProperty(arg.flag)
        }

        if (arg.required && !given)
          return await message.channel.send(
            new app.MessageEmbed()
              .setColor("RED")
              .setAuthor(
                `Missing argument "${arg.name}"`,
                message.client.user?.displayAvatarURL()
              )
              .setDescription(
                arg.description
                  ? "Description: " + arg.description
                  : `Example: \`--${arg.name}=someValue\``
              )
          )

        if (arg.isFlag)
          message.args[arg.name] = message.args.hasOwnProperty(usedName)
        else {
          message.args[arg.name] = message.args[usedName]

          if (value() === undefined) {
            if (arg.default !== undefined) {
              message.args[arg.name] =
                typeof arg.default === "function"
                  ? await arg.default(message)
                  : arg.default
            } else if (arg.castValue !== "array") {
              message.args[arg.name] = null
            }
          } else if (arg.checkValue) {
            const checked = await app.checkValue(
              arg,
              "argument",
              value(),
              message
            )

            if (!checked) return
          }

          if (value() !== null && arg.castValue) {
            const casted = await app.castValue(
              arg,
              "argument",
              value(),
              message,
              (value) => (message.args[arg.name] = value)
            )

            if (!casted) return
          }
        }
      }
    }

    if (cmd.loading) message.channel.startTyping().catch()

    delete message.args._

    try {
      await cmd.run(message)
    } catch (error) {
      message.channel
        .send(
          app.CODE.stringify({
            content: `Error: ${
              error.message?.replace(/\x1b\[\d+m/g, "") ?? "unknown"
            }`,
            lang: "js",
          })
        )
        .catch(console.error)
    }
  },
}

module.exports = listener
