import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { getConfig } from '@/utils/config'

export const LtiRegister = () => {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // check if searchparams has openid_configuration and registration_token
    // if so, send a request to the registration endpoint,
    // and then send a post message to the parent window
    if (
      searchParams.get('openid_configuration') &&
      searchParams.get('registration_token')
    ) {
      console.log('registering tool...', searchParams.toString())
      // send request to registration endpoint
      fetch(
        getConfig().LTI_REGISTER + '?' + searchParams.toString(),

        {
          method: 'GET'
        }
      )
        // send post message to parent window
        // (window.opener || window.parent).postMessage({subject:'org.imsglobal.lti.close'}, '*');
        .then((response) => {
          if (!response.ok) {
            throw new Error('Could not register tool: ' + response.statusText)
          } else;
          ;(window.opener || window.parent).postMessage(
            { subject: 'org.imsglobal.lti.close' },
            '*'
          )
        })
        .catch((error) => {
          console.error('Error registering tool: ', error)
          setError(error.message)
        })
    }
  })

  return (
    <div>
      {error ? (
        <h1>
          Registration failed with error: {error}. Check the console for more information.
        </h1>
      ) : (
        <h1>Please wait while we register your tool...</h1>
      )}
      {error && <p>{error}</p>}
    </div>
  )
}
