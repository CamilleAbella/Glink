import * as app from "../app"

const command: app.Command = {
  name: "leave",
  aliases: ["exit", "quit"],
  guildOwner: true,
  hubOnly: true,
  description: "Leave a network, remove hub",
  async run(message) {
    app.removeHub.bind(message.client)(
      message.channel.id,
      "You have successfully deleted this hub."
    )
  },
}

module.exports = command
