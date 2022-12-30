const express = require("express")
const { v4: uuidv4 } = require('uuid');
const cors = require("cors")
const bodyParser = require("body-parser")
const axios = require("axios")
const fs = require("fs").promises
const fss = require("fs");
const { Configuration, OpenAIApi } = require("openai");
const csv = require('csv-parser')

const app = express()
const port = process.env.PORT || 3000
app.use(cors())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.json())

app.get('/', (req, res) => {
  res.status(404).send("WELCOME")
})

app.post('/create-open-ai-model', async (req, res) => {
  const data = req.body
  const dataKeys = Array.from(Object.keys(data))

  if (dataKeys.includes("estimate") && data['estimate'] == 'y') {

    var cond = false;
    cond = dataKeys.includes("csvUrl") && data['csvUrl'] != '' ? dataKeys.includes("model") && data['model'] != '' ? true : res.status(500).send({ 'error': "Model not provided" }) : res.status(500).send({ 'error': "CSV URL not provided" })

    if (cond == true) {

      await axios.get(data['csvUrl'])
        .then((response) => {

          const csv_character_length = response.data.length
          const num_records = response.data.split('\n').length
          const fileSize = Math.floor(csv_character_length / 1000)
          const n_epochs = data['n_epochs'] ? data['n_epochs'] : 2
          var count = (csv_character_length / 4) * n_epochs

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

          if (condi == true) {
            count = count * n
            count = count.toFixed(2)
            if (count < 0.01) {
              res.status(200).send({ "estimate": `<$0.01`, "num_records": num_records, "num_chars": csv_character_length, "file_size": fileSize })
            } else {
              res.status(200).send({ "estimate": `~$${count}`, "num_records": num_records, "num_chars": csv_character_length, "file_size": fileSize })
            }
          }

        })

    }

  } else {

    var cond = false;
    cond = dataKeys.includes("csvUrl") && data['csvUrl'] != '' ? dataKeys.includes("apiKey") && data['apiKey'] != '' ? dataKeys.includes("model") && data['model'] != '' ? true : res.status(500).send({ 'error': "Model not provided" }) : res.status(500).send({ 'error': "API key not provided" }) : res.status(500).send({ 'error': "CSV URL not provided" })
    if (cond == true) {

      if (!data['csvUrl'].includes('.csv')) {
        res.status(500).send({ 'error': "Invalid file format" })
      } else {

        var arr = []
        var charLength = 0

        await axios.get(data['csvUrl'], { responseType: "stream", })
          .then(async (response) => {

            await response.data
              .pipe(csv())
              .on("data", function(row) {
                arr.push(row);
                charLength += JSON.stringify(Object.values(row)).replaceAll('[', '').replaceAll(']', '').length
              })
              .on("end", async function() {

                var colOne = Object.keys(arr[0])[0]
                var colTwo = Object.keys(arr[0])[1]

                const arr2 = arr.map((item) => (
                  {
                    prompt: item[colOne] + "\n\n###\n\n",
                    completion: item[colTwo] + "###"
                  }
                ))

                var fileSize = await axios.get(data['csvUrl'])
                  .then((response) => {
                    return Math.floor(response.data.length / 1000)
                  })

                const filename = uuidv4() + '.jsonl';
                await fs.writeFile(filename, JSON.stringify(arr2).replaceAll('[', '').replaceAll(']', '').replaceAll('},{', '}\n{'))

                const configuration = new Configuration({
                  apiKey: data['apiKey'],
                });
                const openai = new OpenAIApi(configuration);
                await openai.createFile(
                  fss.createReadStream(filename),
                  "fine-tune"
                ).then(async responses => {

                  await openai.createFineTune({
                    training_file: responses.data.id,
                    model: data['model_name'] ? `${data['model']}:${data['model_name']}` : data['model'],
                    n_epochs: data['n_epochs'] ? data['n_epochs'] : 2
                  }).then(response2 => {
                    res.status(200).send({ "message": "Success", "id": response2.data.id, "num_records": arr.length + 1, "num_chars": charLength, "file_size": fileSize })
                  }).catch(err => { res.status(401).send({ 'error': err.message, 'message': 'Creation failed' }) });

                }).catch(err => { res.status(401).send({ 'error': err.message, message: "Invalid API key" }) });

                await fs.unlink(filename)
              })
              .on("error", function(error) {
                res.status(response.status).send({ 'error': response.error, 'message': "error reading CSV URL" })
              });
          })
          .catch(err => { res.status(403).send({ 'error': "CSV URL unreadable" }) });

      }
    }
  }
})

app.post('/open-ai-models', async (req, res) => {

  const data2 = req.body
  const dataKeys2 = Array.from(Object.keys(data2))

  if (dataKeys2.includes("apiKey")) {

    try {

      const configuration = new Configuration({
        apiKey: data2['apiKey'],
      });
      const openai = new OpenAIApi(configuration);
      await openai.listFineTunes().then(async latest_response => {

        var result = latest_response.data.data.map((item) => {
          var utcSeconds = item.created_at;
          var date = new Date(0);
          date.setUTCSeconds(utcSeconds);

          if (item.status == "failed") {
            return {
              id: item.id,
              n_epochs: item.hyperparams.n_epochs,
              model: item.model,
              status: item.status,
              created_at: date.toDateString(),
              file_error: item.training_files[0].status_details,
              fine_tuned_model: item.fine_tuned_model
            };
          } else {
            return {
              id: item.id,
              n_epochs: item.hyperparams.n_epochs,
              model: item.model,
              status: item.status,
              created_at: date.toDateString(),
              fine_tuned_model: item.fine_tuned_model
            };
          }

        });
        for (let index = 0; index < result.length; index++) { const elem = result[index] }
        res.status(200).send(result.reverse())
      }).catch(err => { res.status(400).send({ 'error': err.message }) })

    } catch (err) {
      res.status(401).send({ 'error': "Invalid Credentials (Incorrect API Key)" })
    }

  } else {
    res.status(500).send({ 'error': "No API key found" })
  }
})

app.listen(port, () => {
  console.log(`listening on PORT: ${port}`)
})