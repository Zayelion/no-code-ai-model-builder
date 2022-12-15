const express = require("express")
const { v4: uuidv4 } = require('uuid');
const cors = require("cors")
const bodyParser = require("body-parser")
const axios = require("axios")
const fs = require("fs").promises
const fss = require("fs");
const { Configuration, OpenAIApi } = require("openai");

const app = express()
const port = process.env.PORT || 3000
app.use(cors())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.json())

app.get('/', (req, res) => {
  res.status(404).send({ 'error': 'Not found' })
})

app.post('/create-open-ai-model', async (req, res) => {
  const data = req.body
  const dataKeys = Array.from(Object.keys(data))

  if (dataKeys.includes("estimate") && data['estimate'] == 'y' ){

    var cond = false;
    cond = dataKeys.includes("csvUrl") && data['csvUrl'] != '' ? dataKeys.includes("model") && data['model'] != '' ? true : res.status(500).send({ 'error': "Model not provided" }) : res.status(500).send({ 'error': "CSV URL not provided" })

    if (cond == true) {
        const response = await axios.get(data['csvUrl'])
        const csv_data = await response.data

        const csv_character_length = csv_data.length
        const n_epochs =  data['n_epochs'] ? data['n_epochs'] : 2

        var count = (csv_character_length/4)*n_epochs

        var condi = true
        switch (data['model']) {
            case 'davinci':
                var n = 0.00003
                break;
            case 'curie':
                var n = 0.000003
                break;
            case 'babbage':
                var n = 0.0000006
                break;
            case 'ada': 
                var n = 0.0000004
                break;
            default:
                condi = false
                res.status(500).send({ 'error': "Model is incorrect" })
                break;
        }

        if (condi==true) {
            count = count*n
            res.status(200).send({"estimate": `$${count}`})
        }

    }

  } else {

    var cond = false;
    cond = dataKeys.includes("csvUrl") && data['csvUrl'] != '' ? dataKeys.includes("apiKey") && data['apiKey'] != '' ? dataKeys.includes("model") && data['model'] != '' ? true : res.status(500).send({ 'error': "Model not provided" }) : res.status(500).send({ 'error': "API key not provided" }) : res.status(500).send({ 'error': "CSV URL not provided" })
    if (cond==true) {

        if (!data['csvUrl'].includes('.csv')) {
            res.status(500).send({ 'error': "Invalid file format" })
        } else {

            const response = await axios.get(data['csvUrl'])
            const csv_data = await response.data

            var csv_data_splitted = csv_data.replaceAll('\r', '').split('\n')
            if (csv_data_splitted[0].includes('prompt,completion')) {

            var arr = [];
            for (let index = 1; index < csv_data_splitted.length; index++) {

                var json_data = {
                "prompt": csv_data_splitted[index].split(',')[0].trim() + "\n\n###\n\n",
                "completion": csv_data_splitted[index].split(',')[1].trim() + "###"
                }
                arr.push(json_data)
            }
            const filename = uuidv4() + '.jsonl';
            await fs.writeFile(filename, JSON.stringify(arr).replace('[', '').replace(']', '').replaceAll('},{', '}\n{'))

            const configuration = new Configuration({
                apiKey: data['apiKey'],
            });
            const openai = new OpenAIApi(configuration);
            const responses = await openai.createFile(
                fss.createReadStream(filename),
                "fine-tune"
            );
            await fs.unlink(filename)

            if (responses.status != 200) {
                res.status(responses.status).send({ 'error': responses.error, 'message': "error from Open AI request" })
            } else {
                const response2 = await openai.createFineTune({
                training_file: responses.data.id,
                model: data['model'],
                n_epochs: data['n_epochs'] ? data['n_epochs'] : 2
                });

                if (response2.status == 200) {
                res.status(200).send({ "message": "Success", "id": response2.data.id })
                } else {
                res.status(response2.status).send({ 'error': response2.error, 'message': "error from Open AI request" })
                }
            }

            } else {
            res.status(500).send({ 'error': "Invalid column headers" })
            }
        }
    }

  }

})

app.listen(port, () => {
  console.log(`listening on PORT: ${port}`)
})