import {clip} from './objects/clip'
import {outcry} from './objects/outcry'
import {incident} from './documents/incident'
import {match} from './documents/match'
import {team} from './documents/team'
import {law} from './documents/law'
import {referendum} from './documents/referendum'
import {vote} from './documents/vote'
import {punditLine} from './documents/punditLine'

export const schemaTypes = [incident, match, team, law, punditLine, referendum, vote, clip, outcry]
