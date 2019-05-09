const assert = require('assert');
const directLineSpec = require('./directline-swagger.json');
const Swagger = require('swagger-client');

const directLineClientName = 'DirectLineClient';
const botExpectedMessage = 'To what city would you like to travel?';
const directLineSecret = process.env.DIRECT_LINE_KEY || null;

const auths = {
    AuthorizationBotConnector: new Swagger.ApiKeyAuthorization('Authorization', 'BotConnector ' + directLineSecret, 'header'),
};

function getDirectLineClient() {    
    return new Swagger({
        spec: directLineSpec,
        usePromise: true,
        authorizations: auths
    });
}

async function sendMessage(client, conversationId) {       
    let status;
    do{
        await client.Conversations.Conversations_PostMessage({
            conversationId: conversationId,
            message: {
                from: directLineClientName,
                text: 'hi bot'
            }
        }).then((result) => {
            status = result.status;
        }).catch((err)=>{
            status = err.status;
        }); 
    }while(status == 502);
}

function getMessages(client, conversationId) {    
    let watermark = null;
    return client.Conversations.Conversations_GetMessages({ conversationId: conversationId, watermark: watermark })
        .then((response) => {            
            return response.obj.messages.filter((message) => message.from !== directLineClientName);       
        });
}

function getConversationId(client) {
    return client.Conversations.Conversations_NewConversation()
        .then((response) => response.obj.conversationId);
}

describe('Test Azure Bot', function(){
    this.timeout(30000);    
    it('Check deployed bot answer', async function(){
        const directLineClient = await getDirectLineClient();    
        const conversationId = await getConversationId(directLineClient);
        await sendMessage(directLineClient, conversationId);
        const messages = await getMessages(directLineClient, conversationId); 
        assert(messages[1].text == botExpectedMessage, `test fail`);    
    });
});