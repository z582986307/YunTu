import React from 'react'
import CaseLists from '../../components/case/caselist'
import 'antd/dist/antd.css'
import '../landing/less/index.less'
import Headers from '../../layouts/headers'

class casePage extends React.Component {
  render() {
    return (
      <section>
        <Headers light />
        <div>
          <CaseLists
            {...this.props}
            type="oe"
            baseUrl=""
            kityApiPrefix="KITY_dev"
            oeApiPrefix=""
            doneApiPrefix=""
            // oeApiPrefix="api_dev"
            // doneApiPrefix="DONE_dev"
          />
        </div>
      </section>
    )
  }
}
export default casePage
