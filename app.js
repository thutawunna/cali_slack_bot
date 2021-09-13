require('dotenv').config();

const { WebClient, LogLevel } = require('@slack/web-api');
const { App } = require("@slack/bolt");

const { Wit, log } = require('node-wit');

const witClient = new Wit({
    accessToken: process.env.WIT_TOKEN,
    // logger: new log.Logger(log.DEBUG)
});

// const sessionService = new SessionService();

const client = new WebClient(process.env.SLACK_TOKEN, {
    logLevel: LogLevel.DEBUG
});

// const createSessionId = (channel, user, ts) => {
//     return `${channel}-${user}-${ts}`;
// }

const app = new App({
    token: process.env.SLACK_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
});

const processEvent = async (event, say, client, body) => {
    try {
        const queryResult = await witClient.message(event.text);
        
        const { intents, entities } = queryResult;
        
        const intent = intents[0].name;
        
        const extractedEntities = {};
        
        Object.keys(entities).forEach((key) => {
            if (entities[key][0].confidence > 0.7) {
                
                let entityKey = key.split(':')[1];
                if (entityKey === 'contact') {
                    const values = [];
                    for (let entityValue = 0; entityValue < entities[key].length; ++entityValue) {
                        values.push(entities[key][entityValue].value);
                    }
                    extractedEntities[entityKey] = values;
                } 
                else {
                    if (entityKey === 'datetime') {
                        extractedEntities[`${entityKey}Grain`] = entities[key][0].grain
                    }
                    extractedEntities[entityKey] = entities[key][0].value;
                }
            }
        });
        
        extractedEntities['intent'] = intent;
        
        if (extractedEntities['intent'] === 'connect_slack_account') {
            
            await say({
                blocks: [
                    {
                        "dispatch_action": true,
                        "type": "input",
                        "block_id": `${event.user}`,
                        "label": {
                            "type": "plain_text",
                            "text": "Username:",
                            "emoji": false
                        },
                        "element": {
                            "type": "plain_text_input",
                            "action_id": "connect_slack_calendar_app",
                            "placeholder": {
                                "type": "plain_text",
                                "text": "Enter your username"
                            }
                        }
                    }
                ]
            });
            
        }
        
        if (extractedEntities['intent'] === 'get_events') {
            const dateTime = new Date(extractedEntities['datetime']);

            extractedEntities['datetime'] = dateTime.toISOString();

            console.log(extractedEntities['datetime']);
            
            const response = await fetch('https://shielded-beach-58320.herokuapp.com/api/slack/events/get', {
            method: 'post',
            body: JSON.stringify({
                slackUserID: event.user,
                date: extractedEntities['datetime'],
                grain: extractedEntities['datetimeGrain']
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const responseJSON = await response.json();
        const eventList = responseJSON['events'];
        
        let blockObject = [];
        
        if (eventList.length >= 1) {
            eventList.forEach(event => {
                let participants = '';
                
                event.participants.forEach(person => {
                    participants += person;
                    if (person != event.participants[event.participants.length -1]) {
                        participants += ',';
                    }
                });
                
                const eventTitle = {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": `${event.title}`
                    }
                }
                
                const eventDetails = {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `*- Date:* ${new Date(event.start).toLocaleDateString()}\n*- Time:* ${new Date(event.start).toLocaleTimeString()} to ${new Date(event.end).toLocaleTimeString()}\n*- Participants:* ${participants}`
                    }
                }
                
                blockObject.push(eventTitle);
                blockObject.push({ "type": "divider" });
                blockObject.push(eventDetails)
                
            });
            await say({ blocks: blockObject })
            
        } else {
            await say('You have no events planned.');
            
        }
    }
    
    
    if (extractedEntities['intent'] === 'process_event') {
        if (extractedEntities['action'] === 'create') {
            const meetingDescription = extractedEntities['event_type'];

            let participants = '';

            if (extractedEntities['contact']) {
                
            
                for (let participant = 0; participant < extractedEntities['contact'].length; ++participant) {
                    participants += extractedEntities['contact'][participant];
                    if (participant != extractedEntities['contact'].length - 1) {
                        participants += ',';
                    }
                }
            }
            
            const meetingTime = new Date(extractedEntities['datetime']);
            
            extractedEntities['datetime'] = meetingTime.toISOString();

            if (participants === '') {
                participants = 'None'
            }

            await say({
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": `*Please confirm appointment details* \n\n*Appointment Date:* ${meetingTime.toLocaleString()}\n*Appointment Type:* ${meetingDescription}\n*Participants:* ${participants}`
                        }
                    },
                    {
                        "type": "actions",
                        "block_id": "verify_appointment",
                        "elements": [
                            {
                                "type": "button",
                                "text": {
                                    "type": "plain_text",
                                    "text": "Create"
                                },
                                "style": "primary",
                                "action_id": "confirm_appointment_create",
                                "value": `${meetingTime.toISOString()}|${meetingDescription}|${participants}`
                            },
                            {
                                "type": "button",
                                "text": {
                                    "type": "plain_text",
                                    "text": "Cancel"
                                },
                                "style": "danger",
                                "action_id": "cancel_appointment_create",
                                "value": "Cancel"
                            }
                        ]
                    }
                ]
            });
        }
    }
    
    return null;
} catch (error) {
    console.error(error.toString());
}
}

const handleMessage = async (event, say, client, body) => {
    // const sessionId = createSessionId(event.channel, event.user, event.thread_ts || event.ts);
    // let session = sessionService.get(sessionId);
    // if (!session) {
    //     session = sessionService.create(sessionId);
    //     session.context = {
    //         slack: {
    //             channel: event.channel,
    //             user: event.user,
    //             thread_ts: event.thread_ts || event.ts
    //         },
    //     };
    // }
    // console.log(session);
    
    let action = await processEvent(event, say, client, body);
    
}

app.event('message', async ({ event, say, client, body }) => {
    if (event.channel_type === 'im') {
        if (event.channel === process.env.BOT_CHANNEL) {
            handleMessage(event, say, client, body);
        }
    }
});

app.action('create_appointment', async ({ action, ack, say }) => {
    
    await ack();
    
    await say({
        blocks: [{
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `Appointment will be created at ${action.selected_date}`
            }
        }]
    });
});

app.action('connect_slack_calendar_app', async ({ action, ack, body, say }) => {
    
    const user = body.user;
    
    await ack();
    
    const response = await fetch('https://shielded-beach-58320.herokuapp.com/account/connect/slack', {
        method: 'post',
        body: JSON.stringify({
            slackUserID: user.id,
            username: action.value,
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (response.status === 200) {
        await say('Slack Account Connected. Please verify by checking your account settings at http://localhost:3000/verify/slack');
    } else {
        const responseJSON = await response.json();
        await say(`${responseJSON.message}`);
    }
});

app.action('confirm_appointment_create', async ({ body, action, ack, say }) => {

    try {
        const user = body.user;
    
        await ack();
        
        const payload = action['value'].split('|');
        const participants = payload[2].split(',');
        
        const eventEnd = new Date(payload[0]);
        eventEnd.setMinutes(eventEnd.getMinutes() + 30);
        
        const eventDetails = {
            'start': payload[0],
            'end': eventEnd.toISOString(),
            'title': payload[1],
            'participants': participants
        }
        
        const response = await fetch('https://shielded-beach-58320.herokuapp.com/api/slack/events/add/', {
            method: 'post',
            body: JSON.stringify({
                slackID: user.id,
                newEvent: eventDetails
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200) {
            await say('The new event has been created!');
        } else {
            const responseJSON = await response.json();
            await say(`${responseJSON.message}`);
        }
    } catch (error) {
        console.error(error.toString());
    }
});

app.action('cancel_appointment_create', async ({ ack, say }) => {

    await ack();

    await say('Event will not be created.');

});

(async () => {
    await app.start();
    console.log('Bolt App Started');
})();
