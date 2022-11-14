require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const fs = require('fs')

// Match database file
const CACHE_FILE = './cache.json';
let db = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));

// Slack Config
const slackToken = process.env.SLACK_TOKEN
const slackWebApi = new WebClient(slackToken);
const slackChannel = process.env.SLACK_CHANNEL_ID

const FIFA_COMPETITION_ID = 17 // World Cup 2022 Qatar
const FIFA_SEASON_ID = 255711  // 2022 World Cup Season ID

// Match Statuses
const MATCH_STATUS_FINISHED = 0;
const MATCH_STATUS_NOT_STARTED = 1;
const MATCH_STATUS_LIVE = 3;
const MATCH_STATUS_PREMATCH = 12;

// Event Types
const EVENT_GOAL = 0;
const EVENT_YELLOW_CARD = 2;
const EVENT_STRAIGHT_RED = 3;
const EVENT_SECOND_YELLOW_CARD_RED = 4; // Maybe?
const EVENT_SUBSTITUTION = 5;
const EVENT_PENALTY = 6;
const EVENT_PERIOD_START = 7;
const EVENT_PERIOD_END = 8;
const EVENT_BLOCKED_SHOT = 12;
const EVENT_FOUL = 14;
const EVENT_OFFSIDE = 15;
const EVENT_CORNER_KICK = 16;
const EVENT_BLOCKED_SHOT_2 = 17;
const EVENT_FOUL_AGAINST_PLAYER = 18;
const EVENT_OUT_OF_BOUNDS = 24; //Goalie catches? or out of bounds/throw?// out of bounds?
const EVENT_END_OF_GAME = 26;
const EVENT_CROSSBAR = 32;
const EVENT_OWN_GOAL = 34;
const EVENT_PENALTY_SHOOTOUT = 35;
const EVENT_PENALTY_SECOND_PENALTY = 36;
const EVENT_HAND_BALL = 37;
const EVENT_FREE_KICK_GOAL = 39;
const EVENT_FREE_KICK_INDIRECT_GOAL = 40;
const EVENT_PENALTY_GOAL = 41;
const EVENT_SECOND_PENALTY_GOAL = 42;
const EVENT_FREE_KICK_CROSSBAR = 44;
const EVENT_PENALTY_SAVED = 60;
const EVENT_PENALTY_HIT_CROSSBAR = 46;
const EVENT_PENALTY_HIT_POST = 51;
const EVENT_PENALTY_MISSED = 65;
const EVENT_FOUL_PENALTY = 72;

// Periods
const PERIOD_1ST_HALF = 3;
const PERIOD_2ND_HALF = 5;
const PERIOD_1ST_ET = 7;
const PERIOD_2ND_ET = 9;
const PERIOD_PENALTY = 11;

const getApiData = async (url) => {
    const response = await fetch(url)
    const data = await response.json()
    return data.Results;
}

const sendMessage = async(messageBody) => {
    console.log(`MSG: ${messageBody}`);
    await slackWebApi.chat.postMessage({
        channel: slackChannel,
        text: messageBody
    })
}

const main = async () => {
    const matches = await getApiData(`https://api.fifa.com/api/v1/calendar/matches?idCompetition=${FIFA_COMPETITION_ID}&idSeason=${FIFA_SEASON_ID}&count=500`);
    await sendMessage('Data loaded from FIFA.');

    // Find Live Matches and Update Text Score
    matches.forEach(match => {
        if (match.MatchStatus == MATCH_STATUS_LIVE) {

            // Variables
            const homeTeamId = match['Home']['IdTeam']
            const awayTeamId = match['Away']['IdTeam']
            const homeTeamName = match['Home']['TeamName'][0]['Description']
            const awayTeamName = match['Away']['TeamName'][0]['Description']

            if (!db[match['IdMatch']]) {
                // Adding new record if it doesn't exist
                db[match.IdMatch] = {
                    id: match['IdMatch'],
                    status: match['Status'],
                    stageId: match['StageId'],
                    homeTeamId: homeTeamId,
                    awayTeamId: awayTeamId,
                    homeTeamName: homeTeamName,
                    awayTeamName: awayTeamName,    
                    lastUpdate: new Date(),
                    score: `${homeTeamName} ${match['Home']['Score']} - ${match['Away']['Score']} ${awayTeamName}`
                }
                console.log(`Added ${match['IdMatch']}`);
            } else {
                console.log(`Cache Exists ${match['IdMatch']}`);
            }

            sendMessage(`:zap: Match ${match.IdMatch} is live! ${match.Home.TeamName[0].Description} vs ${match.Away.TeamName[0].Description}`);
        }

        // Record in the file
        fs.writeFileSync(CACHE_FILE, JSON.stringify(db));
    }
    )

    // Post Updates from the Timeline Feed for Live Matches
    for (let [key, info] of Object.entries(db)) {
        console.log(`:zap: Match ${info.id} is loaded from cache!`);

        // Get Timeline Feed
        const timeline = await fetch(`https://api.fifa.com/api/v1/timelines/${FIFA_COMPETITION_ID}/${FIFA_SEASON_ID}/${info.stageId}/${info.id}?language=en`)

        // Parse JSON
        const timelineData = await timeline.json();

        // Process Events
        let events = timelineData['Event'];

        events.forEach(event => {
            const eventType = event['Type'];
            const period = event['Period'];
            const eventTime = new Date(event['Timestamp']);

            // Get Info on Teams Playing
            const homeTeamId = db[key]['homeTeamId'];
            const awayTeamId = db[key]['awayTeamId'];
            const homeTeamName = db[key]['homeTeamName'];
            const awayTeamName = db[key]['awayTeamName'];
            
            if (eventTime > info.lastUpdate) {
                // We have a new update, let's see if there's something to report on.

                const matchTime = event['MatchMinute']
                const eventTeamId = event['IdTeam']
                // TODO: Could add some more info on player stats and such here.

                switch(eventType) {
                    // Period Start Events
                    case EVENT_PERIOD_START:
                        switch (period) {
                            case PERIOD_1ST_HALF:
                                sendMessage(`:zap: Match Starting - ${homeTeamName} v. ${awayTeamName}`);
                                break;
                            case PERIOD_2ND_HALF:
                            case PERIOD_1ST_ET:
                            case PERIOD_2ND_ET:
                            case PERIOD_PENALTY:
                                sendMessage(`:runner: Period Starting - ${matchTime} - ${homeTeamName} v. ${awayTeamName}`);
                                break;
                        }
                    // Period End Events
                    case EVENT_PERIOD_END:
                        switch (period) {
                            case PERIOD_1ST_HALF:
                                sendMessage(`:zap: End of 1st Half - ${homeTeamName} v. ${awayTeamName}`);
                                break;
                            case PERIOD_2ND_HALF:
                                sendMessage(`:zap: End of 2nd Half - ${homeTeamName} v. ${awayTeamName}`);
                                break;
                            case PERIOD_1ST_ET:
                                sendMessage(`:zap: End of 1st Extra Time - ${homeTeamName} v. ${awayTeamName}`);
                                break;
                            case PERIOD_2ND_ET:
                                sendMessage(`:zap: End of 2nd Extra Time - ${homeTeamName} v. ${awayTeamName}`);
                                break;
                            case PERIOD_PENALTY:
                                sendMessage(`:runner: End of Penalty Kicks - ${matchTime} - ${homeTeamName} v. ${awayTeamName}`);
                                break;
                        }
                    // Goal Events
                    case EVENT_GOAL:
                    case EVENT_FREE_KICK_GOAL:
                    case EVENT_PENALTY_GOAL:
                        sendMessage(`:soccer: Goal - ${matchTime} - ${homeTeamName} v. ${awayTeamName}`);
                        break;
                    case EVENT_OWN_GOAL:
                        sendMessage(`:soccer: Own Goal - ${matchTime} - ${homeTeamName} v. ${awayTeamName}`);
                        break;
                    // Card Events
                    case EVENT_YELLOW_CARD:
                        sendMessage(`:soccer: Yellow Card - ${matchTime} - ${homeTeamName} v. ${awayTeamName}`);
                        break;
                    case EVENT_SECOND_YELLOW_CARD_RED:
                    case EVENT_STRAIGHT_RED:
                        sendMessage(`:soccer: Red Card - ${matchTime} - ${homeTeamName} v. ${awayTeamName}`);
                        break;
                    // Penalty Events
                    case EVENT_FOUL_PENALTY:
                    case EVENT_PENALTY_MISSED:
                    case EVENT_PENALTY_SAVED:
                    case EVENT_PENALTY_HIT_CROSSBAR:
                        sendMessage(`:soccer: Penalty - ${matchTime} - ${homeTeamName} v. ${awayTeamName}`);
                        break;
                    
                    

                }

            }



        })
    }
}

main();
