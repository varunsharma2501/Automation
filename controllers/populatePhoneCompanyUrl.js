const openai = require('../config/openai.config');

const updateMissingInfo = async (responses) => {
  for (const item of responses) {
    if (item.contactDetails === 'NA' && item.website === 'NA') {
      console.log("RETRY")
      const prompt = `Find the phone number and company website URL for "${item.name}". Return only a valid JSON object with exactly two keys: "phone" and "companyUrl". Do not include any explanation, markdown, or extra text.`;

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
        });

        const content = response.choices[0].message.content;

        try {
          const parsed = JSON.parse(content);

          if (parsed.phone && parsed.phone !== 'NA') {
            item.contactDetails = parsed.phone.trim();
          }

          if (parsed.companyUrl && parsed.companyUrl !== 'NA') {
            item.website = parsed.companyUrl.trim();
          }
        } catch (parseErr) {
          console.error(`JSON parse error for ${item.name}:`, parseErr.message, '\nRaw GPT response:', content);
        }

      } catch (err) {
        console.error(`OpenAI error for ${item.name}:`, err.message);
      }
    }
  }

  return responses;
};

module.exports = updateMissingInfo;
